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

// JSON wrapper for settings field that handles serialization/deserialization with Diesel.
// Stored with the Node API's camelCase keys; `default` keeps older rows readable.
#[derive(
    Debug, Clone, Serialize, Deserialize, AsExpression, FromSqlRow, SimpleObject, InputObject,
)]
#[diesel(sql_type = Text)]
#[graphql(input_name = "UserSettingsInput")]
#[serde(rename_all = "camelCase", default)]
#[derive(Default)]
pub struct JsonUserSettings {
    language: Option<String>,

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

    default_model_id: Option<String>,
    default_system_prompt: Option<String>,
    default_temperature: Option<f32>,
    default_max_tokens: Option<i32>,
    default_top_p: Option<f32>,
    default_images_count: Option<i32>,
    documents_embeddings_model_id: Option<String>,
    document_summarization_model_id: Option<String>,
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

impl FromSql<Text, diesel::pg::Pg> for JsonUserSettings {
    fn from_sql(
        bytes: <diesel::pg::Pg as diesel::backend::Backend>::RawValue<'_>,
    ) -> deserialize::Result<Self> {
        let json_str = <String as FromSql<Text, diesel::pg::Pg>>::from_sql(bytes)?;
        let settings: JsonUserSettings = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to deserialize user settings: {}", e))?;
        Ok(settings)
    }
}

#[cfg(feature = "mysql")]
impl FromSql<Text, diesel::mysql::Mysql> for JsonUserSettings {
    fn from_sql(
        bytes: <diesel::mysql::Mysql as diesel::backend::Backend>::RawValue<'_>,
    ) -> deserialize::Result<Self> {
        let json_str = <String as FromSql<Text, diesel::mysql::Mysql>>::from_sql(bytes)?;
        let settings: JsonUserSettings = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to deserialize user settings: {}", e))?;
        Ok(settings)
    }
}

// MultiBackend delegates to the per-backend impls above.
impl FromSql<Text, crate::database::MultiBackend> for JsonUserSettings {
    fn from_sql(
        bytes: <crate::database::MultiBackend as diesel::backend::Backend>::RawValue<'_>,
    ) -> deserialize::Result<Self> {
        bytes.from_sql::<Self, Text>()
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

impl ToSql<Text, diesel::pg::Pg> for JsonUserSettings {
    fn to_sql<'b>(&'b self, out: &mut Output<'b, '_, diesel::pg::Pg>) -> serialize::Result {
        use std::io::Write;
        let json_str = serde_json::to_string(&self)
            .map_err(|e| format!("Failed to serialize user settings: {}", e))?;
        out.write_all(json_str.as_bytes())?;
        Ok(IsNull::No)
    }
}

#[cfg(feature = "mysql")]
impl ToSql<Text, diesel::mysql::Mysql> for JsonUserSettings {
    fn to_sql<'b>(&'b self, out: &mut Output<'b, '_, diesel::mysql::Mysql>) -> serialize::Result {
        use std::io::Write;
        let json_str = serde_json::to_string(&self)
            .map_err(|e| format!("Failed to serialize user settings: {}", e))?;
        out.write_all(json_str.as_bytes())?;
        Ok(IsNull::No)
    }
}

impl ToSql<Text, crate::database::MultiBackend> for JsonUserSettings {
    fn to_sql<'b>(
        &'b self,
        out: &mut Output<'b, '_, crate::database::MultiBackend>,
    ) -> serialize::Result {
        out.set_value((Text, self));
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
    pub role: String,
    pub default_model_id: Option<String>,
    pub default_system_prompt: Option<String>,
    pub avatar_url: Option<String>,
    pub google_id: Option<String>,
    pub github_id: Option<String>,
    pub microsoft_id: Option<String>,
    pub auth_provider: Option<String>,
    pub settings: Option<JsonUserSettings>,
    pub models_count: Option<i32>,
    pub documents_embeddings_model_id: Option<String>,
    pub document_summarization_model_id: Option<String>,
    pub chats_count: Option<i32>,
    pub default_temperature: Option<f32>,
    pub default_max_tokens: Option<i32>,
    pub default_top_p: Option<f32>,
    pub default_images_count: Option<i32>,
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
    pub role: String,
    pub default_model_id: Option<String>,
    pub default_system_prompt: Option<String>,
    pub avatar_url: Option<String>,
    pub google_id: Option<String>,
    pub github_id: Option<String>,
    pub microsoft_id: Option<String>,
    pub auth_provider: Option<String>,
    pub settings: Option<JsonUserSettings>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
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
        microsoft_id: Option<String>,
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
            role,
            default_model_id: None,
            default_system_prompt: None,
            avatar_url,
            google_id,
            github_id,
            microsoft_id,
            auth_provider,
            created_at: now,
            updated_at: now,
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
    pub documents_embeddings_model_id: Option<String>,
    pub document_summarization_model_id: Option<String>,
    pub default_temperature: Option<f32>,
    pub default_max_tokens: Option<i32>,
    pub default_top_p: Option<f32>,
    pub default_images_count: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}
