pub mod auth;
pub mod bulletin;
pub mod error;
pub mod handlers;
pub mod models;

use axum::{
    http::{header, HeaderValue, Method},
    routing::{get, post},
    Router,
};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    limit::RequestBodyLimitLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use handlers::{AppState, SharedState};
use models::*;

#[derive(OpenApi)]
#[openapi(
    paths(
        handlers::healthz,
        handlers::get_election,
        handlers::create_election,
        handlers::issue_credentials,
        handlers::open_voting,
        handlers::close_voting,
        handlers::voter_login,
        handlers::submit_ballot,
        handlers::get_bulletin,
        handlers::get_tally,
        handlers::finalize_tally,
    ),
    components(
        schemas(
            HealthResponse,
            ElectionDetailsResponse,
            CreateElectionRequest,
            IssueCredentialsRequest,
            IssueCredentialsResponse,
            OpenVotingResponse,
            VoterLoginRequest,
            VoterLoginResponse,
            SubmitBallotRequest,
            BallotReceiptResponse,
            BulletinEntry,
            BulletinLogResponse,
            TallyCiphertextResponse,
            FinalizeTallyRequest,
            FinalizeTallyResponse,
            error::ErrorResponse,
            ElectionPhaseDto,
            HexCiphertextDto,
            HexDisjunctiveRangeProofDto,
            HexChaumPedersenProofDto,
        )
    ),
    tags(
        (name = "public", description = "Public audit and verification endpoints"),
        (name = "voter", description = "Voter authentication and ballot submission"),
        (name = "admin", description = "Administrator lifecycle and credential issuance")
    )
)]
pub struct ApiDoc;

pub fn export_openapi_json() -> String {
    ApiDoc::openapi().to_pretty_json().expect("OpenAPI serialization")
}

pub fn build_app(pool: PgPool, admin_token: String) -> Router {
    let state: SharedState = Arc::new(AppState { pool, admin_token });

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
            let s = origin.to_str().unwrap_or("");
            s == "https://voting-murex-seven.vercel.app"
                || s.starts_with("http://localhost:")
                || s.starts_with("http://127.0.0.1:")
                || s.ends_with(".vercel.app")
                || s.ends_with(".onrender.com")
        }))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT]);

    Router::new()
        .route("/healthz", get(handlers::healthz))
        .route("/api/v1/election", get(handlers::get_election))
        .route("/api/v1/admin/election", post(handlers::create_election))
        .route("/api/v1/admin/credentials", post(handlers::issue_credentials))
        .route("/api/v1/admin/open-voting", post(handlers::open_voting))
        .route("/api/v1/admin/close-voting", post(handlers::close_voting))
        .route("/api/v1/voter/login", post(handlers::voter_login))
        .route("/api/v1/ballots", post(handlers::submit_ballot))
        .route("/api/v1/bulletin", get(handlers::get_bulletin))
        .route("/api/v1/tally", get(handlers::get_tally))
        .route("/api/v1/admin/finalize-tally", post(handlers::finalize_tally))
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .layer(TraceLayer::new_for_http())
        .layer(TimeoutLayer::new(Duration::from_secs(15)))
        .layer(RequestBodyLimitLayer::new(256 * 1024)) // 256 KB max payload
        .layer(cors)
        .with_state(state)
}
