use std::fmt;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use chrono::{Utc, NaiveDateTime};
use uuid::Uuid;
use async_graphql::{SimpleObject, InputObject};

use crate::schema::users::{self};

#[derive(Debug, Clone, Serialize, Deserialize, Copy)]
pub enum AuthProvider {
    #[serde(rename = "local")]
    Local,
    #[serde(rename = "google")]
    Google,
    #[serde(rename = "github")]
    GitHub,
    #[serde(rename = "microsoft")]
    Microsoft,
}


impl AuthProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuthProvider::Local => "local",
            AuthProvider::Google => "google",
            AuthProvider::GitHub => "github",
            AuthProvider::Microsoft => "microsoft",
        }
    }
}

impl fmt::Display for AuthProvider {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}


#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable, SimpleObject)]
#[diesel(table_name = users)]
pub struct User {
    pub id: String,
    pub email: String,
    #[serde(skip_serializing)]
    #[graphql(skip)]
    pub password: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub default_model_id: Option<String>,
    pub default_system_prompt: Option<String>,
    pub avatar_url: Option<String>,
    pub google_id: Option<String>,
    pub github_id: Option<String>,
    pub auth_provider: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Serialize, Deserialize, Insertable)]
#[diesel(table_name = users)]
pub struct NewUser {
    pub id: String,
    pub email: String,
    pub password: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub default_model_id: Option<String>,
    pub default_system_prompt: Option<String>,
    pub avatar_url: Option<String>,
    pub google_id: Option<String>,
    pub github_id: Option<String>,
    pub auth_provider: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl NewUser {
    pub fn new(
        email: String,
        password: Option<String>,
        first_name: String,
        last_name: String,
        google_id: Option<String>,
        github_id: Option<String>,
        auth_provider: Option<String>,
        avatar_url: Option<String>,
    ) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: Uuid::new_v4().to_string(),
            email,
            password,
            first_name,
            last_name,
            default_model_id: None,
            default_system_prompt: None,
            avatar_url: avatar_url,
            google_id: google_id,
            github_id: github_id,
            auth_provider: auth_provider,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct RegisterInput {
    pub email: String,
    pub password: String,
    pub first_name: String,
    pub last_name: String,
    pub auth_provider: Option<String>,
    pub avatar_url: Option<String>,
    pub recaptcha_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct LoginInput {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize, InputObject)]
pub struct UpdateUserInput {
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub default_model_id: Option<String>,
    pub default_system_prompt: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}
