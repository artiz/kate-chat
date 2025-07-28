use async_graphql::{InputObject, SimpleObject};
use chrono::{NaiveDateTime, Utc};
use diesel::deserialize::{self, FromSql};
use diesel::prelude::*;
use diesel::serialize::{self, IsNull, Output, ToSql};
use diesel::sql_types::Text;
use diesel::sqlite::Sqlite;
use diesel::{AsExpression, FromSqlRow};
use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

use crate::schema::users::{self};

// JSON wrapper for settings field that handles serialization/deserialization with Diesel
#[derive(
    Debug, Clone, Serialize, Deserialize, AsExpression, FromSqlRow, SimpleObject, InputObject,
)]
#[diesel(sql_type = Text)]
#[graphql(input_name = "UserSettingsInput")]
pub struct JsonUserSettings {
    s3_endpoint: Option<String>,
    s3_region: Option<String>,
    s3_access_key_id: Option<String>,
    s3_secret_access_key: Option<String>,
    s3_files_bucket_name: Option<String>,
    s3_profile: Option<String>,

    aws_bedrock_region: Option<String>,
    aws_bedrock_profile: Option<String>,
    aws_bedrock_access_key_id: Option<String>,
    aws_bedrock_secret_access_key: Option<String>,

    openai_api_key: Option<String>,
    openai_api_admin_key: Option<String>,

    yandex_fm_api_key: Option<String>,
    yandex_fm_api_folder_id: Option<String>,
}

impl FromSql<Text, Sqlite> for JsonUserSettings {
    fn from_sql(
        bytes: <Sqlite as diesel::backend::Backend>::RawValue<'_>,
    ) -> deserialize::Result<Self> {
        let json_str = <String as FromSql<Text, Sqlite>>::from_sql(bytes)?;
        let settings: JsonUserSettings = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to deserialize user settings: {}", e))?;
        Ok(settings)
    }
}

impl ToSql<Text, Sqlite> for JsonUserSettings {
    fn to_sql<'b>(&'b self, out: &mut Output<'b, '_, Sqlite>) -> serialize::Result {
        let json_str = serde_json::to_string(&self)
            .map_err(|e| format!("Failed to serialize user settings: {}", e))?;
        out.set_value(json_str);
        Ok(IsNull::No)
    }
}

pub const ROLE_USER: &str = "user";
pub const ROLE_ADMIN: &str = "admin";

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
    pub password: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub default_model_id: Option<String>,
    pub default_system_prompt: Option<String>,
    pub avatar_url: Option<String>,
    pub google_id: Option<String>,
    pub github_id: Option<String>,
    pub auth_provider: Option<String>,
    pub role: String,
    pub settings: Option<JsonUserSettings>,
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
    pub role: String,
    pub settings: Option<JsonUserSettings>,
}

impl NewUser {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        email: String,
        password: Option<String>,
        first_name: String,
        last_name: String,
        google_id: Option<String>,
        github_id: Option<String>,
        auth_provider: Option<String>,
        avatar_url: Option<String>,
        role: String,
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
            avatar_url,
            google_id,
            github_id,
            auth_provider,
            created_at: now,
            updated_at: now,
            role,
            settings: None,
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
    pub settings: Option<JsonUserSettings>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}
