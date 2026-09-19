import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
if (process.env.TELEGRAM_SEND_ENABLED !== "true")
  throw new Error(
    "Telegram yuborish o‘chiq. Tayyor bo‘lganda TELEGRAM_SEND_ENABLED=true qilib botni yoqing.",
  );
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.BOT_API_SECRET)
  throw new Error("Telegram token va BOT_API_SECRET kerak");
const { startBot } = await import("./bot.js");
await startBot();
