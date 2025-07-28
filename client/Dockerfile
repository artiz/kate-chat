# Build stage
FROM node:21-alpine AS build

ARG APP_API_URL="/api"
ARG APP_WS_URL="/ws"
ARG RECAPTCHA_SITE_KEY=""
ARG COMMIT_SHA=""

WORKDIR /app

COPY package*.json ./
RUN mkdir ./frontend
COPY frontend/package.json ./frontend
RUN npm run install:frontend

COPY ./frontend ./frontend

ENV APP_API_URL=$APP_API_URL
ENV APP_WS_URL=$APP_WS_URL
ENV RECAPTCHA_SITE_KEY=$RECAPTCHA_SITE_KEY
ENV COMMIT_SHA=$COMMIT_SHA
ENV NODE_ENV=production

RUN npm run build:frontend

# Production stage
FROM nginx:alpine

# Copy built frontend files
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY frontend/config/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
