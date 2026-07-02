FROM node:20-alpine AS base

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev

COPY server ./server
COPY frontend ./frontend
COPY db ./db

EXPOSE 3000

CMD ["npm", "start"]
