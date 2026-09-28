import { env } from "./config.js";
import { Queue, Worker } from "bullmq";
import { prisma } from "./core.js";
import { initializeStorage } from "./storage.js";
import {
  processReceipt,
  scheduleBroadcasts,
  housekeeping,
  deliverOne,
} from "./services/jobs.service.js";
const u = new URL(env.redis);
const connection = {
  host: u.hostname,
  port: Number(u.port || 6379),
  password: u.password || undefined,
  username: u.username || undefined,
  ...(u.protocol === "rediss:" ? { tls: {} } : {}),
};
await initializeStorage();
const queue = new Queue("beshball", { connection });
const transactionalOnly =
  process.env.TRANSACTIONAL_NOTIFICATIONS_ONLY === "true";
let lastHousekeeping = 0;
// 8s balances OCR pickup latency against the free-tier's 3-connection DB pool:
// every tick spends one of those connections on a receipt scan even when idle.
await queue.upsertJobScheduler(
  "maintenance",
  { every: 8000 },
  { name: "tick", data: {} },
);
const worker = new Worker(
  "beshball",
  async (job) => {
    if (job.name === "ocr") {
      await processReceipt(job.data.receiptId);
      return;
    }
    if (Date.now() - lastHousekeeping >= 60000) {
      await housekeeping();
      if (!transactionalOnly) await scheduleBroadcasts();
      lastHousekeeping = Date.now();
    }
    for (const r of await prisma.receipt.findMany({
      where: { status: { in: ["RECEIVED", "READING"] } },
      take: 20,
    }))
      await queue.add(
        "ocr",
        { receiptId: r.id },
        {
          jobId: `ocr-${r.id}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    if (env.sendEnabled) {
      for (let n = 0; n < (transactionalOnly ? 1 : 10); n++) {
        const sent = await deliverOne(
          async (chatId, text, imageUrl, replyMarkup) => {
            const method = imageUrl ? "sendPhoto" : "sendMessage";
            const res = await fetch(
              `https://api.telegram.org/bot${env.botToken}/${method}`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  ...(imageUrl ? { photo: imageUrl, caption: text } : { text }),
                  reply_markup: replyMarkup,
                }),
                signal: AbortSignal.timeout(15000),
              },
            );
            const body = (await res.json()) as any;
            if (!body.ok)
              throw Object.assign(new Error("Telegram API xatosi"), {
                code: body.error_code,
                retryAfter: body.parameters?.retry_after,
              });
          },
          { transactionalOnly },
        );
        if (!sent) break;
        await new Promise((r) => setTimeout(r, 1100));
      }
    }
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2) },
);
worker.on("failed", (job) => {
  console.error("Worker job failed:", job?.id);
  if (job?.name === "ocr" && job.attemptsMade >= (job.opts.attempts ?? 1))
    void prisma.receipt
      .updateMany({
        where: {
          id: job.data.receiptId,
          status: { in: ["RECEIVED", "READING"] },
        },
        data: {
          status: "PENDING_REVIEW",
          ocrRawText:
            "OCR yoki ombor xatosi. Rasmni va savdoni xodim tekshirishi kerak.",
          ocrConfidencePercent: 0,
        },
      })
      .catch(() =>
        console.error("OCR review fallback could not be saved:", job.id),
      );
});
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    void worker
      .close()
      .then(() => queue.close())
      .then(() => prisma.$disconnect())
      .then(() => process.exit(0));
  });
