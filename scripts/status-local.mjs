import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const require = createRequire(
  new URL("../packages/backend/package.json", import.meta.url),
);
require("dotenv").config();
const cloud = fs.existsSync(".runtime/cloud-cutover.json")
  ? JSON.parse(fs.readFileSync(".runtime/cloud-cutover.json", "utf8"))
  : null;
let failed = false;
for (const endpoint of ["/health", "/ready", "/branches", "/gifts"]) {
  try {
    const response = await fetch(
      (cloud?.active
        ? cloud.url
        : process.env.BACKEND_URL || "http://127.0.0.1:3000") + endpoint,
      {
        headers: { "x-bot-secret": process.env.BOT_API_SECRET },
        signal: AbortSignal.timeout(cloud?.active ? 90000 : 5000),
      },
    );
    const body = await response.json();
    console.log(
      endpoint,
      response.status,
      Array.isArray(body) ? `count=${body.length}` : JSON.stringify(body),
    );
    if (!response.ok) failed = true;
  } catch {
    console.log(endpoint, "unavailable");
    failed = true;
  }
}
try {
  const response = await fetch(
    cloud?.active ? cloud.url : "http://127.0.0.1:5173",
    {
      signal: AbortSignal.timeout(cloud?.active ? 90000 : 5000),
    },
  );
  console.log("Admin", response.status);
  if (!response.ok) failed = true;
} catch {
  console.log("Admin unavailable");
  failed = true;
}
try {
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
    { signal: AbortSignal.timeout(15000) },
  );
  const body = await response.json();
  console.log(
    "Telegram",
    JSON.stringify({
      ok: body.ok,
      mode: body.result?.url ? "webhook" : "polling",
      pending: body.result?.pending_update_count,
    }),
  );
  if (!body.ok) failed = true;
} catch {
  console.log("Telegram unavailable");
  failed = true;
}
if (!cloud?.active)
  try {
    const state = JSON.parse(
      fs.readFileSync(".runtime/app-processes.json", "utf8"),
    );
    for (const service of state.services) {
      try {
        process.kill(service.pid, 0);
        console.log(service.name, "running");
      } catch {
        console.log(service.name, "STOPPED");
        failed = true;
      }
    }
  } catch {
    console.log("Local launcher state unavailable");
    failed = true;
  }
process.exitCode = failed ? 1 : 0;
