FROM rust:1-bookworm AS builder

WORKDIR /app
ENV SQLX_OFFLINE=true

# Copy full workspace context (filtered by .dockerignore)
COPY . .

# Build release server binary with strict lockfile enforcement
RUN cargo build --release --locked --package server \
 && ls -l target/release/server

# Stage 2: Minimal Debian runtime environment
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -r -u 10001 app

COPY --from=builder /app/target/release/server /usr/local/bin/server

EXPOSE 8080
ENV PORT=8080

USER app

CMD ["server"]
