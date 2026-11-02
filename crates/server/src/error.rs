use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use utoipa::ToSchema;

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
}

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Election state error: {0}")]
    ElectionCore(#[from] election_core::ElectionCoreError),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Cryptographic error: {0}")]
    Crypto(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Rate limit exceeded. Too many attempts, please wait before retrying.")]
    RateLimited,

    #[error("Internal server error")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::ElectionCore(err) => (StatusCode::BAD_REQUEST, "ELECTION_ERROR", err.to_string()),
            AppError::Database(err) => {
                tracing::error!(database_error = %err, "Database operation failed");
                if let sqlx::Error::Database(ref db_err) = err {
                    if db_err.is_unique_violation() {
                        return (
                            StatusCode::CONFLICT,
                            Json(ErrorResponse {
                                error: "Double-vote prevented: nullifier or credential already exists in ledger".to_string(),
                                code: "DUPLICATE_NULLIFIER_OR_CREDENTIAL".to_string(),
                            }),
                        )
                            .into_response();
                    }
                }
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "DATABASE_ERROR",
                    "A database error occurred while processing the request".to_string(),
                )
            }
            AppError::Crypto(msg) => (StatusCode::BAD_REQUEST, "CRYPTO_VERIFICATION_FAILED", msg.clone()),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", msg.clone()),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, "FORBIDDEN", msg.clone()),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, "NOT_FOUND", msg.clone()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, "CONFLICT", msg.clone()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "BAD_REQUEST", msg.clone()),
            AppError::RateLimited => (
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMITED",
                "Rate limit exceeded. Please wait before retrying.".to_string(),
            ),
            AppError::Internal(msg) => {
                tracing::error!(internal_error = %msg, "Internal application error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "An internal server error occurred".to_string(),
                )
            }
        };

        (status, Json(ErrorResponse { error: message, code: code.to_string() })).into_response()
    }
}
