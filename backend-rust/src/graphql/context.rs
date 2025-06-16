use crate::models::User;
use crate::database::DbPool;
use crate::utils::errors::AppError;
use crate::config::AppConfig;

#[derive(Clone)]
pub struct GraphQLContext {
    pub db_pool: DbPool,
    pub config: AppConfig,
 
    pub user: Option<User>,
}


impl GraphQLContext {
    pub fn new(db_pool: DbPool, config: AppConfig, user: Option<User>) -> Self {
        Self { db_pool, config, user }
    }

    pub fn require_user(&self) -> Result<&User, AppError> {
        self.user.as_ref().ok_or_else(|| AppError::Auth("Unauthorized".to_string()))
    }
}
