# 22.23.4 or later: the Brotli decoder fix (CVE-2026-111497); the API's fetch() decodes Brotli from
# external pages and services, and a floating tag can come from a cached layer
FROM node:22.23.4-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN mkdir ./api
COPY api/package.json ./api
RUN npm ci

COPY ./api ./api
RUN npm run build:api

FROM node:22.23.4-alpine
WORKDIR /app
COPY ./db-migrations/ ./
COPY --from=builder /app/node_modules/ ./node_modules
COPY --from=builder /app/api/node_modules/ ./node_modules
COPY --from=builder /app/api/dist ./
# skills (SKILL.md and helper scripts) are served read-only to the app, see services/skills.service.ts
COPY ./api/resources ./resources


ENTRYPOINT ["node", "./index.js"]
CMD ["--production"]
