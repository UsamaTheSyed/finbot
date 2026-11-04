FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
ENV VITE_API_BASE_URL=/api
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package*.json ./
RUN npm ci --omit=dev && ./node_modules/.bin/playwright install --with-deps chromium && npm cache clean --force
COPY --from=build /app/server-dist ./server-dist
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/db/migrations ./server/db/migrations
COPY deploy ./deploy
USER node
EXPOSE 10000
CMD ["node","deploy/start.mjs"]
