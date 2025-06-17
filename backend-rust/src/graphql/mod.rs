pub mod context;
pub mod query;
pub mod mutation;
pub mod subscription;

pub use context::GraphQLContext;
pub use query::Query;
pub use mutation::Mutation;
pub use subscription::SubscriptionRoot;

use async_graphql::Schema;

pub type GraphQLSchema = Schema<Query, Mutation, SubscriptionRoot>;

pub fn create_schema() -> GraphQLSchema {
    Schema::build(Query::default(), Mutation::default(), SubscriptionRoot::default())
        .finish()
}
