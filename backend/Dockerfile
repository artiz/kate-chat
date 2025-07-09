FROM node:21-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN mkdir ./backend
COPY backend/package.json ./backend
RUN npm run install:backend

COPY ./backend ./backend
RUN npm run build:backend


FROM node:21-alpine
WORKDIR /app
COPY --from=builder /app/node_modules/ ./node_modules
COPY --from=builder /app/backend/node_modules/ ./node_modules
COPY --from=builder /app/backend/dist ./

ENTRYPOINT ["node", "./index.js"]
CMD ["--production"]
