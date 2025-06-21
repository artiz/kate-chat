use async_graphql::Data;
use diesel::prelude::*;
use serde_json::Value;
use tracing::{debug, info, warn};
use warp::Filter;

use crate::config::AppConfig;
use crate::database::DbPool;
use crate::graphql::GraphQLSchema;
use crate::models::User;
use crate::schema::users;
use crate::utils::jwt::{extract_token_from_header, verify_token};

pub struct WebSocketServer {
    schema: GraphQLSchema,
    db_pool: DbPool,
    config: AppConfig,
}

impl WebSocketServer {
    pub fn new(schema: GraphQLSchema, db_pool: DbPool, config: AppConfig) -> Self {
        Self {
            schema,
            db_pool,
            config,
        }
    }

    pub async fn start(&self, port: u16) -> Result<(), Box<dyn std::error::Error>> {
        let schema = self.schema.clone();
        let db_pool = self.db_pool.clone();
        let config = self.config.clone();

        // Use the correct async-graphql-warp 7.0 API with connection initialization
        let sub = warp::ws().and(async_graphql_warp::graphql_protocol()).map(
            move |ws: warp::ws::Ws, protocol| {
                let schema = schema.clone();
                let db_pool = db_pool.clone();
                let config = config.clone();
                let reply = ws.on_upgrade(move |socket| {
                    async_graphql_warp::GraphQLWebSocket::new(socket, schema, protocol)
                        .on_connection_init(move |value| {
                            let db_pool = db_pool.clone();
                            let config = config.clone();
                            async move {
                                Self::handle_connection_init(value, db_pool, config).await
                            }
                        })
                        .serve()
                });

                warp::reply::with_header(
                    reply,
                    "Sec-WebSocket-Protocol",
                    protocol.sec_websocket_protocol(),
                )
            },
        );
        let routes = warp::path("graphql")
            .and(warp::path("subscriptions"))
            .and(sub)
            .with(
                warp::cors()
                    .allow_any_origin()
                    .allow_headers(vec!["content-type", "authorization"])
                    .allow_methods(vec!["GET", "POST"]),
            );

        let addr: ([u8; 4], u16) = ([0, 0, 0, 0], port);
        info!(
            "WebSocket GraphQL server listening on: http://{}:{}/graphql/subscriptions",
            addr.0
                .iter()
                .map(|x| x.to_string())
                .collect::<Vec<_>>()
                .join("."),
            port
        );

        warp::serve(routes).run(addr).await;

        Ok(())
    }

    async fn handle_connection_init(
        value: Value,
        db_pool: DbPool,
        config: AppConfig,
    ) -> async_graphql::Result<Data> {
        debug!("WebSocket connection init with params: {:?}", value);

        let mut data = Data::default();

        // Extract authorization from connection parameters
        if let Some(auth_header) = value
            .get("Authorization")
            .or_else(|| value.get("authorization"))
            .and_then(|v| v.as_str())
        {
            debug!("Found authorization header in WebSocket connection params");

            // Extract token from header
            if let Some(token) = extract_token_from_header(auth_header) {
                // Verify token
                match verify_token(token, &config.jwt_secret) {
                    Ok(claims) => {
                        debug!("Token verified successfully for user: {}", claims.sub);

                        // Get user from database
                        let mut conn = db_pool.get().map_err(|e| {
                            async_graphql::Error::new(format!("Database connection failed: {}", e))
                        })?;

                        match users::table
                            .filter(users::id.eq(&claims.sub))
                            .first::<User>(&mut conn)
                        {
                            Ok(user) => {
                                info!(
                                    "WebSocket authenticated user: {} {} ({})",
                                    user.first_name, user.last_name, user.id
                                );
                                data.insert(user);
                            }
                            Err(e) => {
                                warn!(
                                    "User not found in database for ID: {}, error: {}",
                                    claims.sub, e
                                );
                                return Err(async_graphql::Error::new("User not found"));
                            }
                        }
                    }
                    Err(e) => {
                        warn!("WebSocket token verification failed: {}", e);
                        return Err(async_graphql::Error::new("Invalid token"));
                    }
                }
            } else {
                warn!("Invalid authorization header format in WebSocket connection");
                return Err(async_graphql::Error::new(
                    "Invalid authorization header format",
                ));
            }
        } else {
            debug!("No authorization header found in WebSocket connection params");
            // For now, allow connections without auth but log it
            // In production, you might want to reject unauthenticated connections
        }

        Ok(data)
    }
}
