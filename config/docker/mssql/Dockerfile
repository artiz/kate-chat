FROM mcr.microsoft.com/mssql/server:2025-latest

USER root

# Full-text search ships as a separate package, from the repository that matches the base
# image: 2025-latest is Ubuntu 24.04, so noble, not jammy.
# The signing key is kept armored and pointed at by signed-by rather than dearmored: gpg
# wants a tty in this image and fails the build with "cannot open '/dev/tty'".
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
       -o /usr/share/keyrings/microsoft-prod.asc \
    && echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/microsoft-prod.asc] https://packages.microsoft.com/ubuntu/24.04/mssql-server-2025 noble main" \
       > /etc/apt/sources.list.d/mssql-server-2025.list \
    && apt-get update \
    && apt-get install -y mssql-server-fts \
    && rm -rf /var/lib/apt/lists/*

USER mssql
