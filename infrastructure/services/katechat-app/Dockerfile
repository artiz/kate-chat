# build stage
FROM node:22-alpine AS build


ARG APP_API_URL="/"
ARG APP_WS_URL="/"
ARG RECAPTCHA_SITE_KEY=""
ARG COMMIT_SHA=""

WORKDIR /app
# prepare deps
COPY package*.json ./
RUN mkdir ./client
RUN mkdir ./api
COPY client/package.json ./client
COPY api/package.json ./api
RUN npm ci

COPY ./client ./client
COPY ./api ./api

ENV APP_API_URL=$APP_API_URL
ENV APP_WS_URL=$APP_WS_URL
ENV RECAPTCHA_SITE_KEY=$RECAPTCHA_SITE_KEY
ENV COMMIT_SHA=$COMMIT_SHA
ENV NODE_ENV=production

RUN npm run build:client
RUN npm run build:api

# production stage
FROM node:22-alpine

# copy built api
WORKDIR /app
COPY --from=build /app/node_modules/ ./node_modules
COPY --from=build /app/api/dist ./

# copy built frontend client files
COPY --from=build /app/client/dist ./client

# Copy nginx configuration
EXPOSE 80

ENTRYPOINT ["node", "./index.js"]
CMD ["--production"]
