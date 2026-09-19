import { Prisma, PrismaClient } from "@prisma/client";
import {
  createHash,
  timingSafeEqual,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { z } from "zod";
export const prisma = new PrismaClient();
export type Tx = Prisma.TransactionClient;
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}
export function requireThat(
  ok: unknown,
  message: string,
  status = 400,
): asserts ok {
  if (!ok) throw new AppError(message, status);
}
export const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
export function secureEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const id = z.string().min(1).max(120);
export const money = z.number().int().min(0).max(1_000_000_000);
export const key = z.string().min(8).max(120);
export const safeUrl = z
  .string()
  .url()
  .refine((s) => {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password;
  }, "Faqat xavfsiz HTTPS havola");
export const json = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
export function seal(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(hash(process.env.BOT_API_SECRET ?? ""), "hex"),
    iv,
  );
  const body = Buffer.concat([
    cipher.update(JSON.stringify(json(value)), "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    body: body.toString("hex"),
  };
}
export function unseal(value: any) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(hash(process.env.BOT_API_SECRET ?? ""), "hex"),
    Buffer.from(value.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(value.tag, "hex"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(value.body, "hex")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
// Cafe scale: one database advisory lock serializes all balance, stock and campaign mutations.
// Every writer uses this boundary; locks are released by PostgreSQL on commit/rollback.
export async function atomic<T>(fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(42861001)`;
      return fn(tx);
    },
    { maxWait: 15000, timeout: 20000 },
  );
}
export async function once<T>(
  tx: Tx,
  operation: string,
  request: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const fingerprint = hash(JSON.stringify(request));
  const existing = await tx.idempotencyKey.findUnique({
    where: { key: operation },
  });
  if (existing) {
    if (existing.requestHash !== fingerprint)
      throw new AppError(
        "Operatsiya kaliti boshqa so‘rov uchun ishlatilgan",
        409,
      );
    return unseal(existing.response) as T;
  }
  const result = await fn();
  await tx.idempotencyKey.create({
    data: { key: operation, requestHash: fingerprint, response: seal(result) },
  });
  return result;
}
export async function audit(
  tx: Tx,
  staffId: string,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await tx.auditLog.create({
    data: {
      staffUserId: staffId,
      action,
      entityType,
      entityId,
      beforeJson: json(before),
      afterJson: json(after),
    },
  });
}
export async function notify(
  tx: Tx,
  customerId: string,
  text: string,
  eventKey: string,
  textRu?: string,
) {
  const c = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
  await tx.outbox.upsert({
    where: { key: eventKey },
    update: {},
    create: {
      key: eventKey,
      customerId,
      telegramId: String(c.telegramUserId),
      text: c.locale === "ru" ? (textRu ?? text) : text,
    },
  });
}
export const defaultSettings = {
  unitsPerBall: 100000,
  qrSeconds: 180,
  receiptMinutes: 120,
  weeklyAdLimit: 2,
  quietStart: 21,
  quietEnd: 9,
  pointExpiryDays: 0,
  receiptRetentionDays: 365,
  bonusCostSomPerBall: 10000,
  externalMonthlyCostSom: 0,
  // OCR asosida avtomatik tasdiqlash: hammasi mos kelsagina ball avtomatik
  // beriladi, aks holda chek "shubhali" deb operatorga yuboriladi.
  autoApproveEnabled: 1,
  autoApproveMinConfidence: 80,
  autoApproveMinAmountSom: 5000,
  autoApproveMaxAmountSom: 500000,
  autoApproveMerchantNames: ["BESH BOLA LAVASH"] as string[],
};
export async function settings(tx: Tx = prisma) {
  const row = await tx.appSetting.findUnique({ where: { key: "business" } });
  return { ...defaultSettings, ...((row?.value as object) ?? {}) };
}
export function localParts(date = new Date()) {
  const d = new Date(date.getTime() + 5 * 3600000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    weekday: d.getUTCDay(),
  };
}
export function monthStart(date = new Date()) {
  const p = localParts(date);
  return new Date(Date.UTC(p.year, p.month, 1) - 5 * 3600000);
}
export function dayStart(date = new Date()) {
  const p = localParts(date);
  return new Date(Date.UTC(p.year, p.month, p.day) - 5 * 3600000);
}
