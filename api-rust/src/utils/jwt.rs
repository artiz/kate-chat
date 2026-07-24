use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // User ID
    pub exp: i64,    // Expiration time
    pub iat: i64,    // Issued at
}

impl Claims {
    pub fn new(user_id: &str) -> Self {
        let now = Utc::now();
        let exp = now + Duration::days(7); // Token expires in 7 days

        Self {
            sub: user_id.to_string(),
            exp: exp.timestamp(),
            iat: now.timestamp(),
        }
    }
}

pub fn create_token(user_id: &str, secret: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let claims = Claims::new(user_id);

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &validation,
    )
    .map(|data| data.claims)
}

pub fn extract_token_from_header(auth_header: &str) -> Option<&str> {
    if let Some(stripped) = auth_header.strip_prefix("Bearer ") {
        Some(stripped)
    } else {
        None
    }
}

/// Password-reset token (Node parity: purpose-scoped, 15 minutes).
#[derive(Debug, Serialize, Deserialize)]
pub struct ResetClaims {
    pub user_id: String,
    pub email: String,
    pub purpose: String,
    pub exp: i64,
}

pub fn create_reset_token(
    user_id: &str,
    email: &str,
    secret: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let claims = ResetClaims {
        user_id: user_id.to_string(),
        email: email.to_string(),
        purpose: "reset_password".to_string(),
        exp: (Utc::now() + Duration::minutes(15)).timestamp(),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )
}

pub fn verify_reset_token(token: &str, secret: &str) -> Result<ResetClaims, String> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    validation.set_required_spec_claims(&["exp"]);
    let claims = decode::<ResetClaims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &validation,
    )
    .map(|d| d.claims)
    .map_err(|e| e.to_string())?;
    if claims.purpose != "reset_password" {
        return Err("Invalid token purpose".to_string());
    }
    Ok(claims)
}

#[cfg(test)]
mod reset_token_tests {
    use super::*;

    #[test]
    fn reset_token_roundtrip() {
        let token = create_reset_token("u1", "a@b.c", "secret").unwrap();
        let claims = verify_reset_token(&token, "secret").unwrap();
        assert_eq!(claims.user_id, "u1");
        assert_eq!(claims.email, "a@b.c");
        assert!(verify_reset_token(&token, "other").is_err());
    }
}
