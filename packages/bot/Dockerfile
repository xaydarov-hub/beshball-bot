FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/bot/package.json packages/bot/
COPY packages/admin/package.json packages/admin/
RUN npm ci
COPY . .
RUN npm run build -w @beshball/shared && npm run build -w @beshball/bot
ENV NODE_ENV=production
USER node
CMD ["node","packages/bot/dist/index.js"]
