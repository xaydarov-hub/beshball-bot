import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});
export const env = {
  port: Number(process.env.PORT ?? 3000),
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  botSecret: process.env.BOT_API_SECRET ?? "",
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  redis: process.env.REDIS_URL ?? "redis://localhost:6379",
  sendEnabled: process.env.TELEGRAM_SEND_ENABLED === "true",
  frontendOrigin: process.env.ADMIN_URL ?? "http://localhost:5173",
};
export function assertConfiguration() {
  if (env.botSecret.length < 32)
    throw new Error("BOT_API_SECRET kamida 32 belgidan iborat bo‘lsin");
  if (
    process.env.NODE_ENV === "production" &&
    (!env.botToken ||
      env.webhookSecret.length < 32 ||
      !process.env.TELEGRAM_WEBHOOK_URL)
  )
    throw new Error(
      "Production uchun Telegram token va webhook sozlamalari kerak",
    );
  if (process.env.DEMO_AUTH)
    throw new Error("Demo autentifikatsiya qo‘llanmaydi");
}
