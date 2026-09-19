FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-rus openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/bot/package.json packages/bot/
COPY packages/admin/package.json packages/admin/
RUN npm ci
COPY . .
RUN npm run prisma:generate && npm run build -w @beshball/shared && npm run build -w @beshball/backend
ENV NODE_ENV=production HOST=0.0.0.0
USER node
EXPOSE 3000
CMD ["node","packages/backend/dist/index.js"]
