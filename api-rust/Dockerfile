# Build stage
FROM rustlang/rust:nightly AS builder

WORKDIR /app

# Copy Cargo files
COPY Cargo.toml Cargo.lock ./

# Create a dummy main.rs to build dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies
RUN cargo build --release && rm src/main.rs

# Copy source code
COPY src ./src

# Build the application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install required system packages
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    libpq5 \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/target/release/kate-chat-backend .

# Copy environment example
COPY .env.example .env.example

# Create data directory for SQLite
RUN mkdir -p data

# Expose port
EXPOSE 4000

# Set environment variables
ENV RUST_LOG=info
ENV DATABASE_URL=sqlite://data/katechat.sqlite

# Run the application
CMD ["./kate-chat-backend"]