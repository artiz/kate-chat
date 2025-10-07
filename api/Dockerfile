FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN mkdir ./api
COPY api/package.json ./api
RUN npm ci

COPY ./api ./api
RUN npm run build:api

FROM node:22-alpine
WORKDIR /app
COPY ./db-migrations/ ./
COPY --from=builder /app/node_modules/ ./node_modules
COPY --from=builder /app/api/node_modules/ ./node_modules
COPY --from=builder /app/api/dist ./


ENTRYPOINT ["node", "./index.js"]
CMD ["--production"]
