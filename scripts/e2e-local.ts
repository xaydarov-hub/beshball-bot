import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
const backendRequire = createRequire(
  new URL("../packages/backend/package.json", import.meta.url),
);
const sharp = backendRequire("sharp");
const { Queue, QueueEvents, Worker } = backendRequire("bullmq");

// This harness only runs against the dedicated test database, never production.
const local = JSON.parse(fs.readFileSync(".runtime/runtime.json", "utf8"));
assert.ok(new URL(local.TEST_DATABASE_URL).pathname.endsWith("/beshball_test"));
Object.assign(process.env, local, {
  DATABASE_URL: local.TEST_DATABASE_URL,
  NODE_ENV: "test",
  TELEGRAM_BOT_TOKEN: "123456:E2E_ONLY_FAKE_TOKEN",
  TELEGRAM_SEND_ENABLED: "false",
  BOT_API_SECRET: "e2e-secret-at-least-32-characters-long",
  S3_BUCKET: "beshball-e2e",
  ADMIN_URL: "http://127.0.0.1:5174",
});
const { prisma, atomic } = await import("../packages/backend/src/core.js");
const { credit, balance } = await import(
  "../packages/backend/src/services/points.service.js"
);
const { processReceipt } = await import(
  "../packages/backend/src/services/jobs.service.js"
);
const { initializeStorage, signedImage } = await import(
  "../packages/backend/src/storage.js"
);
const { buildServer } = await import("../packages/backend/src/server.js");
const app = buildServer();
await app.ready();
await initializeStorage();
const stamp = randomUUID();
const staff = await prisma.staffUser.upsert({
  where: { telegramUserId: 900001001n },
  update: { active: true, role: "SUPER_ADMIN" },
  create: {
    telegramUserId: 900001001n,
    fullName: "Sinov bosh administratori",
    role: "SUPER_ADMIN",
  },
});
const branch = await prisma.branch.create({
  data: { name: "Sinov — Chilonzor" },
});
const customer = await prisma.customer.create({
  data: {
    telegramUserId: BigInt(Date.now()),
    fullName: "Sinov mijoz",
    phoneE164: `+998${String(Date.now()).slice(-9)}`,
    phoneVerified: true,
    dataConsentAt: new Date(),
  },
});
const gift = await prisma.gift.create({
  data: {
    nameUz: "Sinov pitsa",
    priceBalls: 7,
    menuPriceSom: 59000,
    realCostSom: 30000,
    branches: { create: { branchId: branch.id } },
  },
});
await atomic((tx) =>
  credit(tx, customer.id, 735000, "MANUAL_ADJUSTMENT", stamp),
);
const headers = {
  "x-bot-secret": process.env.BOT_API_SECRET!,
  "x-telegram-user-id": String(customer.telegramUserId),
};
function auth(id: bigint) {
  const p = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: Number(id) }),
  };
  const secret = createHmac("sha256", "WebAppData")
    .update(process.env.TELEGRAM_BOT_TOKEN!)
    .digest();
  const hash = createHmac("sha256", secret)
    .update(
      Object.entries(p)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    )
    .digest("hex");
  return new URLSearchParams({ ...p, hash }).toString();
}
const svg = Buffer.from(
  `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="600" fill="white"/><g font-family="Arial" font-size="38" fill="black"><text x="40" y="70">BESH BOLA LAVASH</text><text x="40" y="145">TEST RECEIPT ONLY</text><text x="40" y="220">Chek 12345</text><text x="40" y="295">07.09.2026 12:30</text><text x="40" y="370">Jami 32 000.00 UZS</text><text x="40" y="450" font-size="14">${stamp}</text></g></svg>`,
);
const image = await sharp(svg).png().toBuffer();
let uploaded = await app.inject({
  method: "POST",
  url: `/customers/${customer.id}/receipts`,
  headers,
  payload: {
    branchId: branch.id,
    imageBase64: image.toString("base64"),
    idempotencyKey: stamp,
  },
});
assert.equal(uploaded.statusCode, 201, uploaded.body);
const receiptId = uploaded.json().receiptId;
const retryUpload = await app.inject({
  method: "POST",
  url: `/customers/${customer.id}/receipts`,
  headers,
  payload: {
    branchId: branch.id,
    imageBase64: image.toString("base64"),
    idempotencyKey: stamp,
  },
});
assert.equal(retryUpload.statusCode, 201, retryUpload.body);
assert.equal(retryUpload.json().receiptId, receiptId);
assert.equal(
  await prisma.receipt.count({ where: { customerId: customer.id } }),
  1,
);
const row = await prisma.receipt.findUniqueOrThrow({
  where: { id: receiptId },
});
assert.equal(
  (await fetch(`${local.S3_ENDPOINT}/beshball-e2e/${row.imageStorageKey}`))
    .status,
  403,
);
const signed = await signedImage(row.imageStorageKey);
assert.equal((await fetch(signed)).status, 200);
console.log("PASS: real image upload, private bucket and signed read URL");
const rurl = new URL(local.REDIS_URL);
const connection = { host: rurl.hostname, port: Number(rurl.port) };
const queueName = `beshball-e2e-${stamp}`;
const queue = new Queue(queueName, { connection });
const events = new QueueEvents(queueName, { connection });
await events.waitUntilReady();
const worker = new Worker(
  queueName,
  async (job) => processReceipt(job.data.receiptId),
  { connection },
);
const job = await queue.add("ocr", { receiptId }, { attempts: 1 });
await job.waitUntilFinished(events, 60000);
const processed = await prisma.receipt.findUniqueOrThrow({
  where: { id: receiptId },
});
assert.equal(processed.status, "PENDING_REVIEW");
assert.equal(
  processed.ocrAmountSom,
  32000,
  processed.ocrRawText ?? "No OCR text",
);
assert.equal(processed.ocrEngine, "tesseract-wasm");
console.log("PASS: Redis + BullMQ + real Tesseract OCR → manual review");
const duplicate = await app.inject({
  method: "POST",
  url: `/customers/${customer.id}/receipts`,
  headers,
  payload: {
    branchId: branch.id,
    imageBase64: image.toString("base64"),
    idempotencyKey: randomUUID(),
  },
});
assert.equal(duplicate.statusCode, 409);
const invalid = await app.inject({
  method: "POST",
  url: `/customers/${customer.id}/receipts`,
  headers,
  payload: {
    branchId: branch.id,
    imageBase64: Buffer.from("not an image").toString("base64"),
    idempotencyKey: randomUUID(),
  },
});
assert.ok(invalid.statusCode >= 400);
const root = path.resolve("packages/admin/dist");
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, "http://127.0.0.1:5174");
    if (url.pathname.startsWith("/api/")) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const result = await app.inject({
        method: req.method as any,
        url: req.url!.slice(4),
        headers: req.headers as any,
        payload: chunks.length ? Buffer.concat(chunks) : undefined,
      });
      res.writeHead(result.statusCode, { "content-type": "application/json" });
      res.end(result.body);
      return;
    }
    const target = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!target.startsWith(root + path.sep) && target !== root) {
      res.writeHead(403);
      res.end();
      return;
    }
    const file =
      fs.existsSync(target) && fs.statSync(target).isFile()
        ? target
        : path.join(root, "index.html");
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(500);
    res.end("E2E server error");
  }
});
await new Promise<void>((resolve) => server.listen(5174, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
await context.route("https://telegram.org/**", (route) =>
  route.fulfill({ body: "", contentType: "application/javascript" }),
);
await context.addInitScript((data) => {
  (window as any).Telegram = {
    WebApp: { initData: data, ready() {}, expand() {} },
  };
}, auth(staff.telegramUserId));
const page = await context.newPage();
const pageErrors: string[] = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
fs.mkdirSync("artifacts", { recursive: true });
try {
  await page.goto("http://127.0.0.1:5174/");
  await page.getByRole("heading", { name: "Biznes ko‘rinishi" }).waitFor();
  await page.getByText("Sovg‘alar iqtisodiyoti").waitFor();
  await page.screenshot({
    path: "artifacts/dashboard-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  );
  await page.getByRole("link", { name: "Cheklar", exact: true }).click();
  await page
    .getByRole("button", { name: "Ko‘rish", exact: true })
    .first()
    .click();
  await page.getByLabel("Haqiqiy tegishli xarid summasi (so‘m)").fill("32000");
  await page.getByLabel("Filial", { exact: true }).selectOption(branch.id);
  const purchased = new Date(Date.now() - 60000 + 5 * 3600000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel("Xarid vaqti — Toshkent").fill(purchased);
  await page.getByLabel("Kassa raqami").fill("E2E-TILL");
  await page.getByLabel("Noyob savdo / chek ID").fill(stamp);
  await page
    .getByLabel("Tekshiruv izohi / rad etish yoki qaytarish sababi")
    .fill("Faqat avtomatik sinov bazasidagi tekshiruv");
  await page
    .getByLabel("Kafening to‘langan, qaytarilmagan savdosi ekanini tekshirdim")
    .check();
  await page.screenshot({
    path: "artifacts/receipt-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await page.getByText("Amal saqlandi.", { exact: true }).waitFor();
  uploaded = await app.inject({
    method: "POST",
    url: `/customers/${customer.id}/reservations`,
    headers,
    payload: {
      giftId: gift.id,
      branchId: branch.id,
      idempotencyKey: randomUUID(),
    },
  });
  assert.equal(uploaded.statusCode, 200, uploaded.body);
  const reservation = uploaded.json();
  await page.getByRole("link", { name: "Sovg‘a berish", exact: true }).click();
  await page.getByLabel("QR token — qo‘lda kiritish").fill(reservation.qrToken);
  await page.getByRole("button", { name: "Ma’lumotni tekshirish" }).click();
  await page
    .getByRole("button", { name: "Mahsulotni berdim — tasdiqlash" })
    .waitFor();
  assert.equal((await balance(customer.id)).totalUnits, 767000);
  await page.screenshot({
    path: "artifacts/cashier-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Mahsulotni berdim — tasdiqlash" })
    .click();
  await page.getByText("Sovg‘a berildi. Ball bir marta yechildi.").waitFor();
  assert.equal((await balance(customer.id)).totalUnits, 67000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5174/");
  await page.getByText("Sovg‘alar iqtisodiyoti").waitFor();
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  for (const [route, endpoint] of [
    ["mijozlar", "customers"], ["sovgalar", "gifts"], ["aksiyalar", "campaigns"],
    ["xabarlar", "broadcasts"], ["xodimlar", "staff"], ["filiallar", "branches"],
    ["fikrlar", "feedback"], ["audit", "audit"], ["sozlamalar", "settings"],
  ]) {
    const loaded = page.waitForResponse(r => new URL(r.url()).pathname === `/api/admin/${endpoint}`);
    await page.goto(`http://127.0.0.1:5174/${route}`);
    assert.equal((await loaded).status(), 200, `${route} API`);
    await page.getByRole("heading", {level:1}).waitFor();
    assert.equal(await page.getByRole("alert").count(),0,`${route} error state`);
  }
  console.log("PASS: all 12 admin sections open with authenticated API data");
  assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
  console.log(
    "PASS: mobile 390px + desktop UI, actual API approval and scan-preview-confirm redemption",
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await worker.close();
  await events.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await app.close();
  await prisma.$disconnect();
}
console.log("E2E complete. No real Telegram messages were sent.");
