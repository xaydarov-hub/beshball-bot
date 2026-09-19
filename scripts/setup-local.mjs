import fs from "node:fs";
import crypto from "node:crypto";
const path = ".env";
const exists = fs.existsSync(path);
let text = exists
  ? fs.readFileSync(path, "utf8")
  : fs.readFileSync(".env.example", "utf8");
const values = {
  POSTGRES_PASSWORD: crypto.randomBytes(24).toString("hex"),
  BOT_API_SECRET: crypto.randomBytes(32).toString("hex"),
  TELEGRAM_WEBHOOK_SECRET: crypto.randomBytes(32).toString("hex"),
  S3_ACCESS_KEY: "beshball_local",
  S3_SECRET_KEY: crypto.randomBytes(32).toString("hex"),
};
for (const [k, v] of Object.entries(values)) {
  const re = new RegExp(`^${k}=(.*)$`, "m");
  const m = text.match(re);
  if (!m) text += `\n${k}=${v}`;
  else if (!m[1].trim()) text = text.replace(re, `${k}=${v}`);
}
if (!exists) {
  const password = text.match(/^POSTGRES_PASSWORD=(.*)$/m)[1];
  text = text.replace("SET_PASSWORD", password);
  fs.writeFileSync(path, text + "\n");
  console.log(".env yaratildi. Telegram yuborish o‘chiq.");
} else {
  fs.writeFileSync(".env.generated", text + "\n");
  console.log(
    "Mavjud .env saqlandi. Yetishmagan qiymatlar .env.generated fayliga yozildi; lokal DB URL va yuborish holatini tekshiring.",
  );
}
