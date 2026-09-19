import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const origin = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
if (!origin?.startsWith("https://"))
  throw new Error("RENDER_EXTERNAL_URL yoki HTTPS PUBLIC_URL kerak");
for (const name of [
  "DATABASE_URL",
  "REDIS_URL",
  ...(process.env.STORAGE_PROVIDER === "supabase"
    ? ["SUPABASE_STORAGE_URL", "SUPABASE_SERVICE_KEY"]
    : ["S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"]),
  "BOT_API_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
])
  if (!process.env[name]) throw new Error(`${name} sozlanmagan`);
Object.assign(process.env, {
  NODE_ENV: "production",
  HOST: "0.0.0.0",
  SERVE_ADMIN: "true",
  ADMIN_URL: origin,
  TELEGRAM_WEBHOOK_URL: `${origin}/telegram/webhook`,
  BACKEND_URL: `http://127.0.0.1:${process.env.PORT || "10000"}`,
  PORT: process.env.PORT || "10000",
});
// Database and bucket are external: no customer data is kept on Render's ephemeral disk.
const databaseCheck = spawnSync(
  process.execPath,
  ["scripts/check-cloud-database.mjs"],
  { env: process.env, stdio: "inherit" },
);
if (![0, 2].includes(databaseCheck.status))
  process.exit(databaseCheck.status || 1);
for (const args of databaseCheck.status === 0
  ? []
  : [
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        "packages/backend/prisma/schema.prisma",
      ],
      ["scripts/secure-cloud-database.mjs"],
      ["--import", "tsx", "scripts/seed.ts"],
    ]) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children.toReversed()) child.kill("SIGTERM");
  setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 8000).unref();
  process.exitCode = code;
}
function launch(script, extra = {}) {
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, ...extra },
    stdio: "inherit",
  });
  children.push(child);
  child.on("error", () => stop(1));
  child.on("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
}
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => stop());
launch("packages/backend/dist/index.js");
let ready = false;
for (let n = 0; n < 60 && !stopping; n++) {
  try {
    ready = (
      await fetch(`${process.env.BACKEND_URL}/ready`, {
        signal: AbortSignal.timeout(1000),
      })
    ).ok;
  } catch {
    /* Starting */
  }
  if (ready) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!ready) stop(1);
else {
  launch("packages/backend/dist/worker.js", {
    TRANSACTIONAL_NOTIFICATIONS_ONLY: "true",
  });
  if (process.env.TELEGRAM_SEND_ENABLED === "true")
    launch("packages/bot/dist/index.js");
  console.log(
    `BeshBall HTTPS: ${origin}. Telegram: ${process.env.TELEGRAM_SEND_ENABLED === "true" ? "webhook" : "cutover pending"}`,
  );
}
