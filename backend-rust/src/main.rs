mod config;
mod database;
mod models;
mod schema;
mod graphql;
mod middleware;
mod services;
mod controllers;
mod utils;

use log::debug;
use rocket::{Build, Rocket, fairing::AdHoc, State};
use rocket_cors::{AllowedOrigins, CorsOptions};
use rocket::config::{Config};
use async_graphql_rocket::{GraphQLRequest, GraphQLResponse};

use crate::config::AppConfig;
use crate::database::establish_connection;
use crate::controllers::{auth, files};
use crate::graphql::{create_schema, GraphQLContext, GraphQLSchema};
use crate::middleware::auth::OptionalUser;
use crate::database::DbPool;

#[rocket::post("/graphql", data = "<request>", format = "application/json")]
async fn graphql_handler(
    schema: &State<GraphQLSchema>,
    db_pool: &State<DbPool>,
    config: &State<AppConfig>,
    request: GraphQLRequest,
    optional_user: OptionalUser,
) -> GraphQLResponse {
    let ctx = GraphQLContext::new(db_pool.inner().clone(), config.inner().clone(), optional_user.0);

    request.data(ctx).execute(schema.inner()).await
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
    env_logger::init();
    dotenv::dotenv().ok();

    let config = AppConfig::from_env();

    debug!("Starting on port {}", config.port);

    let cors = CorsOptions::default()
        .allowed_origins(AllowedOrigins::All) // some_exact(&config.cors_origin.split(',').collect::<Vec<_>>())
        .allow_credentials(true)
        .to_cors()
        .expect("Error creating CORS fairing");

    let schema = create_schema();

    let rocket_config = Config {
         port: config.port,
         ..Config::debug_default()
     };
     
    rocket::custom(rocket_config)
        .attach(cors)
        .attach(AdHoc::on_ignite("Database", |rocket| async {
            let db = establish_connection().await;
            rocket.manage(db)
        }))
        .manage(config)
        .manage(schema)
        .mount("/", rocket::routes![graphql_handler, graphql_query_handler, graphql_options_handler])
        .mount("/auth", auth::routes())
        .mount("/files", files::routes())
        .mount("/api/files", files::routes())
}


