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
