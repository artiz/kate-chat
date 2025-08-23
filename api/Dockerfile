FROM node:21-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN mkdir ./api
COPY api/package.json ./api
RUN npm ci
RUN npm run install:api

COPY ./api ./api
RUN npm run build:api

FROM node:21-alpine
WORKDIR /app
COPY --from=builder /app/node_modules/ ./node_modules
COPY --from=builder /app/api/node_modules/ ./node_modules
COPY --from=builder /app/api/dist ./

ENTRYPOINT ["node", "./index.js"]
CMD ["--production"]
