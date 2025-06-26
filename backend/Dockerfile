FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN mkdir ./backend
COPY backend/package.json ./backend
RUN npm run install:backend

COPY ./backend ./backend
RUN npm run build:backend

WORKDIR /app/backend/dist
CMD ["npm", "run", "start"]
