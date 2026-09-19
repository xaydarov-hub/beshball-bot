FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/bot/package.json packages/bot/
COPY packages/admin/package.json packages/admin/
RUN npm ci
COPY . .
RUN npm run build -w @beshball/admin
FROM nginx:1.28-alpine
COPY --from=build /app/packages/admin/dist /usr/share/nginx/html
COPY packages/admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
