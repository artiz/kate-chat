use crate::models::User;
use crate::database::DbPool;

#[derive(Clone)]
pub struct GraphQLContext {
    pub db_pool: DbPool,
    pub user: Option<User>,
}

impl GraphQLContext {
    pub fn new(db_pool: DbPool, user: Option<User>) -> Self {
        Self { db_pool, user }
    }

    pub fn require_user(&self) -> Result<&User, String> {
        self.user.as_ref().ok_or_else(|| {
            "Authentication required".to_string()
        })
    }
}
