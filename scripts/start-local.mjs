import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const require = createRequire(
  new URL("../packages/backend/package.json", import.meta.url),
);
require("dotenv").config({ path: path.join(root, ".env") });
const runtime = path.join(root, ".runtime");
fs.mkdirSync(runtime, { recursive: true });
const children = [];
let stopping = false;

function listening(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port: Number(port), host });
    const finish = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}

async function waitFor(check, name) {
  for (let n = 0; n < 60; n++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} ishga tushmadi. .runtime loglarini tekshiring.`);
}

function launch(name, executable, args, extraEnv = {}) {
  const out = fs.openSync(path.join(runtime, `${name}.stdout.log`), "a");
  const err = fs.openSync(path.join(runtime, `${name}.stderr.log`), "a");
  const child = spawn(executable, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    windowsHide: true,
    stdio: ["ignore", out, err],
  });
  fs.closeSync(out);
  fs.closeSync(err);
  children.push({ name, child });
  child.on("error", (error) => {
    console.error(`${name}: ${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${name} to'xtadi (${code}).`);
      shutdown(1);
    }
  });
  console.log(`${name}: PID ${child.pid}`);
  return child;
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const { child } of children.toReversed()) child.kill("SIGTERM");
  fs.rmSync(path.join(runtime, "app-processes.json"), { force: true });
  setTimeout(() => process.exit(code), 1000);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => shutdown());

async function main() {
  if (fs.existsSync(path.join(runtime, "cloud-cutover.json"))) {
    const cloud = JSON.parse(
      fs.readFileSync(path.join(runtime, "cloud-cutover.json"), "utf8"),
    );
    if (cloud.active) {
      console.log(
        `BeshBall serverda ishlaydi: ${cloud.url}. Telegram: @beshball_bot`,
      );
      console.log(
        "Lokal pollingni qayta yoqish uchun avval bulutdagi botni to‘xtating.",
      );
      return;
    }
  }
  const backendPort = Number(process.env.PORT || 3000);
  if (await listening(backendPort)) {
    throw new Error(
      `${backendPort} port band. Mavjud BeshBall xizmatini avval to'xtating.`,
    );
  }
  if (process.env.BOT_API_SECRET?.length < 32 || !process.env.BOT_API_SECRET)
    throw new Error(".env: BOT_API_SECRET kamida 32 belgi bo'lishi kerak.");
  if (
    !process.env.TELEGRAM_BOT_TOKEN ||
    process.env.TELEGRAM_SEND_ENABLED !== "true"
  )
    throw new Error(
      ".env: haqiqiy TELEGRAM_BOT_TOKEN va TELEGRAM_SEND_ENABLED=true kerak.",
    );
  for (const file of [
    "packages/backend/dist/index.js",
    "packages/bot/dist/index.js",
    "packages/admin/dist/index.html",
  ])
    if (!fs.existsSync(file)) throw new Error("Avval npm run build bajaring.");

  const database = new URL(process.env.DATABASE_URL);
  const redis = new URL(process.env.REDIS_URL);
  const storage = new URL(process.env.S3_ENDPOINT);
  for (const url of [database, redis, storage])
    if (!["127.0.0.1", "localhost"].includes(url.hostname))
      throw new Error(
        "Bu buyruq faqat lokal xizmatlar uchun. Serverda Docker Compose ishlating.",
      );

  if (!(await listening(database.port || 5432))) {
    const executable = path.join(runtime, "pg/package/native/bin/pg_ctl.exe");
    if (!fs.existsSync(executable))
      throw new Error("PostgreSQLni Docker Compose orqali ishga tushiring.");
    const result = spawnSync(
      executable,
      [
        "-D",
        path.join(runtime, "pgdata"),
        "-l",
        path.join(runtime, "postgres.log"),
        "-o",
        `-h 127.0.0.1 -p ${database.port || 5432}`,
        "-w",
        "start",
      ],
      { windowsHide: true, stdio: "inherit" },
    );
    if (result.status !== 0) throw new Error("PostgreSQL ishga tushmadi.");
  }
  if (!(await listening(redis.port || 6379))) {
    const folder = fs
      .readdirSync(path.join(runtime, "redis"))
      .find((name) => name.startsWith("Redis-"));
    launch("redis", path.join(runtime, "redis", folder, "redis-server.exe"), [
      "--bind",
      "127.0.0.1",
      "--port",
      redis.port || "6379",
      "--dir",
      path.join(runtime, "redis-data"),
      "--appendonly",
      "yes",
    ]);
    await waitFor(() => listening(redis.port || 6379), "Redis");
  }
  if (!(await listening(storage.port || 9000))) {
    launch(
      "minio",
      path.join(runtime, "minio.exe"),
      [
        "server",
        path.join(runtime, "minio-data"),
        "--address",
        `127.0.0.1:${storage.port || 9000}`,
        "--console-address",
        "127.0.0.1:59001",
      ],
      {
        MINIO_ROOT_USER: process.env.S3_ACCESS_KEY,
        MINIO_ROOT_PASSWORD: process.env.S3_SECRET_KEY,
      },
    );
    await waitFor(() => listening(storage.port || 9000), "MinIO");
  }
  for (const args of [
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      "packages/backend/prisma/schema.prisma",
    ],
    ["--import", "tsx", "scripts/seed.ts"],
  ]) {
    const result = spawnSync(process.execPath, args, {
      env: process.env,
      windowsHide: true,
      stdio: "inherit",
    });
    if (result.status !== 0) throw new Error("Baza tayyorlash bajarilmadi.");
  }
  launch("backend", process.execPath, ["packages/backend/dist/index.js"]);
  await waitFor(async () => {
    try {
      return (
        await fetch(`http://127.0.0.1:${backendPort}/ready`, {
          signal: AbortSignal.timeout(1000),
        })
      ).ok;
    } catch {
      return false;
    }
  }, "Backend");
  // Starting the customer bot does not authorize sending queued broadcasts.
  launch("worker", process.execPath, ["packages/backend/dist/worker.js"], {
    TELEGRAM_SEND_ENABLED: "false",
  });
  launch("bot", process.execPath, ["packages/bot/dist/index.js"]);
  launch("admin", process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
    "packages/admin",
  ]);
  fs.writeFileSync(
    path.join(runtime, "app-processes.json"),
    JSON.stringify(
      {
        supervisor: process.pid,
        startedAt: new Date().toISOString(),
        services: children.map(({ name, child }) => ({ name, pid: child.pid })),
      },
      null,
      2,
    ),
  );
  console.log(
    "BeshBall: http://localhost:5173 | API: http://127.0.0.1:3000/ready",
  );
  console.log(
    "Bot ulanish holati: .runtime/bot.stdout.log. To'xtatish: Ctrl+C.",
  );
}
main().catch((error) => {
  console.error(error.message);
  shutdown(1);
});
