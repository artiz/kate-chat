pub mod context;
pub mod query;
pub mod mutation;

pub use context::GraphQLContext;
pub use query::Query;
pub use mutation::Mutation;

use async_graphql::{Schema, EmptySubscription};

pub type GraphQLSchema = Schema<Query, Mutation, EmptySubscription>;

pub fn create_schema() -> GraphQLSchema {
    Schema::build(Query::default(), Mutation::default(), EmptySubscription)
        .finish()
}