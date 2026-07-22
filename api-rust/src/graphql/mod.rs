pub mod context;
pub mod mutation;
pub mod query;
pub mod subscription;

pub use context::GraphQLContext;
pub use mutation::Mutation;
pub use query::Query;
pub use subscription::SubscriptionRoot;

use async_graphql::Schema;

pub type GraphQLSchema = Schema<Query, Mutation, SubscriptionRoot>;

pub fn create_schema() -> GraphQLSchema {
    Schema::build(Query, Mutation, SubscriptionRoot).finish()
}

#[cfg(test)]
mod tests {
    #[test]
    fn export_sdl() {
        let schema = super::create_schema();
        std::fs::write(
            concat!(env!("CARGO_MANIFEST_DIR"), "/target/schema.graphql"),
            schema.sdl(),
        )
        .expect("write sdl");
    }
}
