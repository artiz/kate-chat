use tracing::info;
use warp::Filter;

use crate::graphql::{GraphQLSchema};

pub struct WebSocketServer {
    schema: GraphQLSchema,
}

impl WebSocketServer {
    pub fn new(schema: GraphQLSchema) -> Self {
        Self {
            schema,
        }
    }

    pub async fn start(&self, port: u16) -> Result<(), Box<dyn std::error::Error>> {
        let schema = self.schema.clone();
        // let ctx = GraphQLContext::new(self.db_pool.clone(), self.config.clone(), None);

        let sub = async_graphql_warp::graphql_subscription(schema.clone());
        let routes = warp::path("graphql")
            .and(warp::path("subscriptions"))
            .and(sub)
            .with(
                warp::cors()
                    .allow_any_origin()
                    .allow_headers(vec!["content-type", "authorization"])
                    .allow_methods(vec!["GET", "POST"]),
            );

        let addr = ([0, 0, 0, 0], port);
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
}
