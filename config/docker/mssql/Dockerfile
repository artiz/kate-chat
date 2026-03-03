FROM mcr.microsoft.com/mssql/server:2025-latest

USER root

RUN apt-get update \
    && apt-get install -y curl gnupg \ 
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64,armhf,arm64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/ubuntu/22.04/mssql-server-2025 jammy main" \
       > /etc/apt/sources.list.d/mssql-server-2025.list \
    && apt-get update \
    && apt-get install -y mssql-server-fts \
    && rm -rf /var/lib/apt/lists/*

USER mssql
