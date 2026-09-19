import {
  atomic,
  prisma,
  settings,
  localParts,
  notify,
  requireThat,
  json,
} from "../core.js";
import { readImage, deleteImage } from "../storage.js";
import { TesseractOcrAdapter } from "../adapters/ocr/tesseract.adapter.js";
import { autoReview } from "./auto-review.service.js";
import { z } from "zod";
export async function processReceipt(receiptId: string) {
  const r = await prisma.receipt.findUniqueOrThrow({
    where: { id: receiptId },
  });
  if (!["RECEIVED", "READING"].includes(r.status)) return;
  const claimed = await prisma.receipt.updateMany({
    where: { id: r.id, status: { in: ["RECEIVED", "READING"] } },
    data: { status: "READING" },
  });
  if (!claimed.count) return;
  const result = await new TesseractOcrAdapter().extract(
    await readImage(r.imageStorageKey),
  );
  const o = z
    .object({
      engine: z.string(),
      confidencePercent: z.number().int().min(0).max(100),
      rawText: z.string().max(100000),
      receiptExternalId: z.string().optional(),
      purchasedAtIso: z.string().datetime().optional(),
      amountSom: z.number().int().min(0).max(1_000_000_000).optional(),
    })
    .parse(result);
  const claimedFinal = await prisma.receipt.updateMany({
    where: { id: r.id, status: "READING" },
    data: {
      status: "PENDING_REVIEW",
      ocrEngine: o.engine,
      ocrConfidencePercent: o.confidencePercent,
      ocrRawText: o.rawText,
      ocrExternalReceiptId: o.receiptExternalId,
      ocrPurchasedAt: o.purchasedAtIso ? new Date(o.purchasedAtIso) : null,
      ocrAmountSom: o.amountSom,
    },
  });
  // Xato bo'lsa ham chek PENDING_REVIEW holatida qoladi - operator
  // qo'lda tekshiradi, shuning uchun bu yerdagi xato butun OCR ishini
  // muvaffaqiyatsiz qilmasligi kerak.
  if (claimedFinal.count)
    await autoReview(r.id).catch((e) =>
      console.error("Auto-review failed:", r.id, e),
    );
}
export function canAdvertise(
  c: {
    marketingConsentAt: Date | null;
    marketingUnsubscribed: boolean;
    blocked: boolean;
  },
  sentLastWeek: number,
  limit: number,
  hour: number,
  start = 21,
  end = 9,
) {
  return (
    !!c.marketingConsentAt &&
    !c.marketingUnsubscribed &&
    !c.blocked &&
    sentLastWeek < limit &&
    hour >= end &&
    hour < start
  );
}
export async function scheduleBroadcasts() {
  return atomic(async (tx) => {
    const cfg = await settings(tx);
    const hour = localParts().hour;
    if (hour < cfg.quietEnd || hour >= cfg.quietStart) return;
    const broadcasts = await tx.broadcast.findMany({
      where: {
        status: "SCHEDULED",
        cancelledAt: null,
        scheduledAt: { lte: new Date() },
      },
    });
    for (const b of broadcasts) {
      const customers = await tx.customer.findMany({
        where: {
          marketingConsentAt: { not: null },
          marketingUnsubscribed: false,
          blocked: false,
          telegramBlocked: false,
          ...(b.audienceBranchId
            ? { receipts: { some: { branchId: b.audienceBranchId } } }
            : {}),
        },
      });
      for (const c of customers) {
        const n = await tx.broadcastRecipientLog.count({
          where: {
            customerId: c.id,
            attemptedAt: { gte: new Date(Date.now() - 7 * 86400000) },
          },
        });
        const queued = await tx.outbox.count({
          where: {
            customerId: c.id,
            broadcastId: { not: null },
            status: { in: ["PENDING", "SENDING"] },
          },
        });
        if (n + queued >= cfg.weeklyAdLimit) continue;
        await tx.broadcastRecipientLog.upsert({
          where: {
            broadcastId_customerId: { broadcastId: b.id, customerId: c.id },
          },
          update: {},
          create: { broadcastId: b.id, customerId: c.id },
        });
        await tx.outbox.upsert({
          where: { key: `ad:${b.id}:${c.id}` },
          update: {},
          create: {
            key: `ad:${b.id}:${c.id}`,
            customerId: c.id,
            telegramId: String(c.telegramUserId),
            text: c.locale === "ru" ? (b.bodyRu ?? b.bodyUz) : b.bodyUz,
            imageUrl: b.imageUrl,
            buttonLabel: b.buttonLabel,
            buttonUrl: b.buttonUrl,
            broadcastId: b.id,
          },
        });
      }
      await tx.broadcast.update({
        where: { id: b.id },
        data: { status: "QUEUED" },
      });
    }
  });
}
export async function housekeeping() {
  await atomic(async (tx) => {
    const cfg = await settings(tx);
    await tx.giftReservation.updateMany({
      where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
    if (cfg.pointExpiryDays > 0) {
      const lots = await tx.pointLot.findMany({
        where: {
          remaining: { gt: 0 },
          expiresAt: { not: null, lte: new Date(Date.now() + 7 * 86400000) },
        },
      });
      for (const lot of lots) {
        if (
          await tx.giftReservation.count({
            where: {
              customerId: lot.customerId,
              status: "ACTIVE",
              expiresAt: { gt: new Date() },
            },
          })
        )
          continue;
        if (lot.expiresAt! > new Date()) {
          if (!lot.remindedAt) {
            await notify(
              tx,
              lot.customerId,
              `${lot.remaining} birlikning muddati ${lot.expiresAt!.toISOString().slice(0, 10)} kuni tugaydi.`,
              `expiry-reminder:${lot.id}`,
            );
            await tx.pointLot.update({
              where: { id: lot.id },
              data: { remindedAt: new Date() },
            });
          }
          continue;
        }
        await tx.ledgerEntry.create({
          data: {
            customerId: lot.customerId,
            type: "EXPIRY",
            unitsDelta: -lot.remaining,
            relatedReceiptId: lot.receiptId,
            operationKey: `expiry:${lot.id}`,
            reasonNote: "Tasdiqlangan saqlash muddati tugadi",
          },
        });
        await tx.pointLot.update({
          where: { id: lot.id },
          data: { remaining: 0 },
        });
      }
    }
  });
  const cfg = await settings();
  const old = await prisma.receipt.findMany({
    where: {
      firstReceivedAt: {
        lt: new Date(Date.now() - cfg.receiptRetentionDays * 86400000),
      },
      imageStorageKey: { not: "PURGED" },
      status: { in: ["APPROVED", "REJECTED", "REVERSED"] },
    },
    take: 20,
  });
  for (const r of old) {
    await deleteImage(r.imageStorageKey);
    await prisma.receipt.update({
      where: { id: r.id },
      data: { imageStorageKey: "PURGED", ocrRawText: null },
    });
  }
}
export async function deliverOne(
  send: (
    telegramId: string,
    text: string,
    imageUrl: string | null,
    button: Record<string, unknown> | undefined,
  ) => Promise<void>,
  options: { transactionalOnly?: boolean } = {},
) {
  // The common empty-queue case needs one read and no balance transaction.
  const eligible = await prisma.outbox.findFirst({
    where: {
      ...(options.transactionalOnly ? { broadcastId: null } : {}),
      OR: [
        { status: "PENDING", availableAt: { lte: new Date() } },
        { status: "SENDING", lockedAt: { lt: new Date(Date.now() - 120000) } },
      ],
    },
    select: { id: true },
  });
  if (!eligible) return false;
  const item = await atomic(async (tx) => {
    await tx.outbox.updateMany({
      where: {
        status: "SENDING",
        lockedAt: { lt: new Date(Date.now() - 120000) },
      },
      data: { status: "PENDING" },
    });
    const row = await tx.outbox.findFirst({
      where: {
        status: "PENDING",
        availableAt: { lte: new Date() },
        ...(options.transactionalOnly ? { broadcastId: null } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    if (!row) return null;
    if (
      row.customerId &&
      (await tx.customer.count({
        where: { id: row.customerId, telegramBlocked: true },
      }))
    ) {
      await tx.outbox.update({
        where: { id: row.id },
        data: { status: "CANCELLED" },
      });
      return null;
    }
    if (row.broadcastId) {
      const c = await tx.customer.findUniqueOrThrow({
        where: { id: row.customerId! },
      });
      const b = await tx.broadcast.findUniqueOrThrow({
        where: { id: row.broadcastId },
      });
      const cfg = await settings(tx);
      const logs = await tx.broadcastRecipientLog.count({
        where: {
          customerId: c.id,
          broadcastId: { not: b.id },
          attemptedAt: { gte: new Date(Date.now() - 7 * 86400000) },
        },
      });
      if (
        b.cancelledAt ||
        !c.marketingConsentAt ||
        c.marketingUnsubscribed ||
        c.blocked ||
        logs >= cfg.weeklyAdLimit
      ) {
        await tx.outbox.update({
          where: { id: row.id },
          data: { status: "CANCELLED" },
        });
        return null;
      }
      if (
        !canAdvertise(
          c,
          logs,
          cfg.weeklyAdLimit,
          localParts().hour,
          cfg.quietStart,
          cfg.quietEnd,
        )
      ) {
        await tx.outbox.update({
          where: { id: row.id },
          data: { availableAt: new Date(Date.now() + 3600000) },
        });
        return null;
      }
      await tx.broadcastRecipientLog.update({
        where: {
          broadcastId_customerId: { broadcastId: b.id, customerId: c.id },
        },
        data: { attemptedAt: new Date() },
      });
    }
    return tx.outbox.update({
      where: { id: row.id },
      data: {
        status: "SENDING",
        lockedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  });
  if (!item) return false;
  try {
    await send(
      item.telegramId,
      item.text,
      item.imageUrl,
      item.buttonUrl
        ? {
            inline_keyboard: [
              [{ text: item.buttonLabel, url: item.buttonUrl }],
              ...(item.broadcastId
                ? [
                    [
                      {
                        text: "Reklamadan chiqish / Отписаться",
                        callback_data: "marketing:off",
                      },
                    ],
                  ]
                : []),
            ],
          }
        : item.broadcastId
          ? {
              inline_keyboard: [
                [
                  {
                    text: "Reklamadan chiqish / Отписаться",
                    callback_data: "marketing:off",
                  },
                ],
              ],
            }
          : undefined,
    );
    await atomic(async (tx) => {
      await tx.outbox.update({
        where: { id: item.id },
        data: { status: "SENT", sentAt: new Date(), lastError: null },
      });
      if (item.broadcastId)
        await tx.broadcastRecipientLog.update({
          where: {
            broadcastId_customerId: {
              broadcastId: item.broadcastId,
              customerId: item.customerId!,
            },
          },
          data: { status: "SENT", sentAt: new Date() },
        });
    });
  } catch (error) {
    const e = error as any;
    await atomic(async (tx) => {
      const permanent = e.code === 403 || item.attempts >= 8;
      await tx.outbox.update({
        where: { id: item.id },
        data: {
          status: permanent ? "FAILED" : "PENDING",
          availableAt: new Date(
            Date.now() +
              Math.max(e.retryAfter ?? 0, Math.min(3600, 2 ** item.attempts)) *
                1000,
          ),
          lastError: `Telegram error ${Number(e.code) || "network"}`,
        },
      });
      if (e.code === 403 && item.customerId)
        await tx.customer.update({
          where: { id: item.customerId },
          data: { marketingUnsubscribed: true, telegramBlocked: true },
        });
      if (e.code === 403)
        await tx.outbox.updateMany({
          where: { telegramId: item.telegramId, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
      if (item.broadcastId)
        await tx.broadcastRecipientLog.update({
          where: {
            broadcastId_customerId: {
              broadcastId: item.broadcastId,
              customerId: item.customerId!,
            },
          },
          data: {
            status: permanent ? "FAILED" : "RETRY",
            deliveryError: `Telegram error ${Number(e.code) || "network"}`,
          },
        });
    });
  }
  return true;
}
void requireThat;
void json;
