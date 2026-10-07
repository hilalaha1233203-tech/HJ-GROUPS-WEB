FROM node:22-slim

ENV NODE_ENV=production
ENV PORT=4173
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server.mjs ./server.mjs
COPY server ./server
COPY src/lib ./src/lib

EXPOSE 4173

CMD ["node", "server.mjs"]
