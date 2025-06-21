mod config;
mod controllers;
mod database;
mod graphql;
mod middleware;
mod models;
mod schema;
mod services;
mod utils;
mod websocket;

use async_graphql_rocket::{GraphQLRequest, GraphQLResponse};
use rocket::config::Config;
use rocket::{fairing::AdHoc, Build, Rocket, State};
use rocket_cors::{AllowedOrigins, CorsOptions};
use tracing::{debug, error, info, instrument, warn};

use crate::config::AppConfig;
use crate::controllers::{auth, files};
use crate::database::establish_connection;
use crate::database::DbPool;
use crate::graphql::{create_schema, GraphQLContext, GraphQLSchema};
use crate::middleware::auth::OptionalUser;
use crate::utils::logger::init_logging;
use crate::websocket::WebSocketServer;

#[rocket::post("/graphql", data = "<request>", format = "application/json")]
#[instrument(skip(schema, db_pool, config, request), fields(user_id = ?optional_user.0.as_ref().map(|u| &u.id)))]
async fn graphql_handler(
    schema: &State<GraphQLSchema>,
    db_pool: &State<DbPool>,
    config: &State<AppConfig>,
    request: GraphQLRequest,
    optional_user: OptionalUser,
) -> GraphQLResponse {
    debug!("Processing GraphQL request");

    let ctx = GraphQLContext::new(
        db_pool.inner().clone(),
        config.inner().clone(),
        optional_user.0,
    );
    let response = request.data(ctx).execute(schema.inner()).await;

    if response.0.is_ok() {
        debug!("GraphQL request completed successfully");
    } else {
        warn!("GraphQL request completed with errors");
    }

    response
}

#[rocket::get("/graphql")]
async fn graphql_query_handler() -> &'static str {
    "GraphQL Playground - use POST /graphql for queries"
}

#[rocket::options("/graphql")]
async fn graphql_options_handler() -> rocket::http::Status {
    rocket::http::Status::Ok
}

#[rocket::launch]
async fn rocket() -> Rocket<Build> {
    // Initialize logging first
    init_logging();
    dotenv::dotenv().ok();

    let config = AppConfig::from_env();

    info!("Starting Kate Chat Backend on port {}", config.port);
    info!(
        "Environment: {}",
        std::env::var("ENVIRONMENT").unwrap_or_else(|_| "development".to_string())
    );
    info!(
        "Log level: {}",
        std::env::var("LOG_LEVEL").unwrap_or_else(|_| "debug".to_string())
    );
    info!(
        "Api Providers: {}",
        std::env::var("ENABLED_API_PROVIDERS").unwrap_or_else(|_| "none".to_string())
    );

    if !config.enabled_api_providers.is_empty() {
        info!("Enabled API providers: {:?}", config.enabled_api_providers);
    } else {
        warn!("No API providers enabled. Set ENABLED_API_PROVIDERS environment variable.");
    }

    let cors = CorsOptions::default()
        .allowed_origins(AllowedOrigins::All) // some_exact(&config.cors_origin.split(',').collect::<Vec<_>>())
        .allow_credentials(true)
        .to_cors()
        .expect("Error creating CORS fairing");

    let schema = create_schema();
    let db_pool = establish_connection().await;

    // Start WebSocket server for GraphQL subscriptions
    let ws_server = WebSocketServer::new(schema.clone(), db_pool.clone(), config.clone());
    let ws_port = config.port + 1; // Use next port for WebSocket server

    info!("Starting WebSocket server on port {}", ws_port);
    tokio::spawn(async move {
        if let Err(e) = ws_server.start(ws_port).await {
            error!("WebSocket server error: {}", e);
        }
    });

    let rocket_config = Config {
        port: config.port,
        ..Config::debug_default()
    };

    info!("Initializing Rocket server...");

    rocket::custom(rocket_config)
        .attach(cors)
        .attach(AdHoc::on_ignite("Database", move |rocket| async move {
            info!("Database connection already established");
            rocket.manage(db_pool)
        }))
        .attach(AdHoc::on_liftoff("Server Started", |_| {
            Box::pin(async {
                info!("🚀 Kate Chat Backend server has started successfully!");
            })
        }))
        .manage(config)
        .manage(schema)
        .mount(
            "/",
            rocket::routes![
                graphql_handler,
                graphql_query_handler,
                graphql_options_handler
            ],
        )
        .mount("/auth", auth::routes())
        .mount("/files", files::routes())
        .mount("/api/files", files::routes())
}
