import { spawnSync } from "node:child_process";
import fs from "node:fs";
const local = fs.existsSync(".runtime/runtime.json")
  ? JSON.parse(fs.readFileSync(".runtime/runtime.json", "utf8"))
  : {};
const url = process.env.TEST_DATABASE_URL ?? local.TEST_DATABASE_URL;
if (!url)
  throw new Error(
    "TEST_DATABASE_URL alohida beshball_test bazasiga yo‘naltirilsin",
  );
if (!new URL(url).pathname.endsWith("/beshball_test"))
  throw new Error("Only a dedicated beshball_test database is permitted");
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: url,
  BOT_API_SECRET: "beshball-integration-secret-32-characters-only",
  TELEGRAM_BOT_TOKEN: "123456:TEST_ONLY_NOT_REAL",
  TELEGRAM_SEND_ENABLED: "false",
  TELEGRAM_WEBHOOK_URL: "https://example.invalid/telegram/webhook",
  TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret-at-least-32-characters",
  SUPER_ADMIN_TELEGRAM_IDS: "",
};
for (const args of [
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
    "--schema",
    "packages/backend/prisma/schema.prisma",
  ],
  [
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    "packages/backend/test/integration/flows.test.ts",
  ],
]) {
  const r = spawnSync(process.execPath, args, { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
