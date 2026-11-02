# Stage 1: Build binary using official Rust bookworm image
FROM rust:1.85-bookworm AS builder

WORKDIR /usr/src/app

# Copy root manifests and workspace crates
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY cli ./cli

# Build release server binary
RUN cargo build --release --package server

# Stage 2: Minimal Debian runtime environment
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from builder stage
COPY --from=builder /usr/src/app/target/release/server /app/server

# Expose default HTTP port
EXPOSE 8080

ENV PORT=8080

# Health check against Axum /healthz
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT}/healthz || exit 1

CMD ["/app/server"]
