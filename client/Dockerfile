# Build stage
# 22.23.4 or later: the Brotli decoder fix (CVE-2026-111497), which Node 21 never got
FROM node:22.23.4-alpine AS build

ARG APP_API_URL="/api"
ARG APP_WS_URL="/ws"
ARG RECAPTCHA_SITE_KEY=""
ARG COMMIT_SHA=""

WORKDIR /app

COPY package*.json ./
RUN mkdir ./client
RUN mkdir -p ./packages/katechat-ui
COPY client/package.json ./client
COPY packages/katechat-ui/package.json ./packages/katechat-ui/
RUN npm ci

# the client bundles @katechat/ui from ../packages/katechat-ui/src (see client/esbuild.prod.mjs)
COPY ./packages ./packages
COPY ./client ./client

ENV APP_API_URL=$APP_API_URL
ENV APP_WS_URL=$APP_WS_URL
ENV RECAPTCHA_SITE_KEY=$RECAPTCHA_SITE_KEY
ENV COMMIT_SHA=$COMMIT_SHA
ENV NODE_ENV=production

RUN npm run build:client

# Production stage
FROM nginx:alpine

# Copy built client files
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY --from=build /app/client/.well-known /usr/share/nginx/html/.well-known

# Copy nginx configuration
COPY client/config/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
