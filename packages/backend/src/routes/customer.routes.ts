import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  prisma,
  atomic,
  requireThat,
  id,
  key,
  json,
  once,
  seal,
  unseal,
} from "../core.js";
import { botAuth, customerAuth } from "../auth/access.js";
import { balance } from "../services/points.service.js";
import { reserveGift } from "../services/redemption.service.js";
import { decodeImage, upload, distance } from "../storage.js";
import { rewardGoalProgress } from "@beshball/shared";
const birthday = z
  .string()
  .regex(/^\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`2000-${s}T00:00:00Z`);
    return !Number.isNaN(+d) && d.toISOString().slice(5, 10) === s;
  })
  .nullable()
  .optional();
export function registerCustomerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req) => {
    botAuth(req);
  });
  app.get("/bot/customers/by-telegram/:telegramId", async (req) => {
    const { telegramId } = z
      .object({ telegramId: z.string().regex(/^\d+$/) })
      .parse(req.params);
    requireThat(
      telegramId === req.headers["x-telegram-user-id"],
      "Mijozga ruxsat yo‘q",
      403,
    );
    const c = await prisma.customer.findUnique({
      where: { telegramUserId: BigInt(telegramId) },
    });
    requireThat(c, "Mijoz topilmadi", 404);
    return { customerId: c.id, locale: c.locale, fullName: c.fullName };
  });
  app.post("/bot/register", async (req) => {
    const b = z
      .object({
        telegramUserId: z.number().int().positive(),
        phoneE164: z.string().regex(/^\+[1-9]\d{7,14}$/),
        fullName: z.string().trim().min(2).max(100),
        locale: z.enum(["uz", "ru"]).default("uz"),
        dataConsentAt: z.string().datetime(),
        marketingConsent: z.boolean().default(false),
        birthDayMonth: birthday,
        referrerTelegramId: z.string().regex(/^\d+$/).optional(),
      })
      .parse(req.body);
    requireThat(
      String(b.telegramUserId) === req.headers["x-telegram-user-id"],
      "Telegram ID mos emas",
      403,
    );
    return atomic(async (tx) => {
      const existing = await tx.customer.findUnique({
        where: { telegramUserId: BigInt(b.telegramUserId) },
      });
      if (existing) return { customerId: existing.id };
      const r = b.referrerTelegramId
        ? await tx.customer.findUnique({
            where: { telegramUserId: BigInt(b.referrerTelegramId) },
          })
        : null;
      const c = await tx.customer.create({
        data: {
          telegramUserId: BigInt(b.telegramUserId),
          phoneE164: b.phoneE164,
          phoneVerified: true,
          fullName: b.fullName,
          locale: b.locale,
          dataConsentAt: new Date(),
          marketingConsentAt: b.marketingConsent ? new Date() : null,
          birthDate: b.birthDayMonth
            ? new Date(`2000-${b.birthDayMonth}T00:00:00Z`)
            : null,
          referredByCustomerId:
            r && String(r.telegramUserId) !== String(b.telegramUserId)
              ? r.id
              : null,
        },
      });
      return { customerId: c.id };
    });
  });
  app.get("/branches", () =>
    prisma.branch.findMany({
      where: { active: true },
      select: { id: true, name: true, address: true },
    }),
  );
  app.get("/gifts", () =>
    prisma.gift.findMany({
      where: { active: true, temporarilyUnavailable: false },
      select: {
        id: true,
        nameUz: true,
        nameRu: true,
        descriptionUz: true,
        imageUrl: true,
        priceBalls: true,
        menuPriceSom: true,
        branches: { where: { active: true }, select: { branchId: true } },
      },
      orderBy: { priceBalls: "asc" },
    }),
  );
  app.get("/campaigns", () =>
    prisma.campaign.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
        ],
      },
      select: {
        id: true,
        nameUz: true,
        bonusPercent: true,
        multiplierNum: true,
        multiplierDen: true,
        minAmountSom: true,
        audienceNote: true,
      },
    }),
  );
  app.get("/customers/:customerId/balance", async (req) => {
    const { customerId } = z.object({ customerId: id }).parse(req.params);
    await customerAuth(req, customerId);
    return balance(customerId);
  });

  app.get("/customers/:customerId/club-card", async (req) => {
    const { customerId } = z.object({ customerId: id }).parse(req.params);
    const customer = await customerAuth(req, customerId);
    const current = await balance(customerId);
    const catalog = await prisma.gift.findMany({
      where: {
        active: true,
        temporarilyUnavailable: false,
        branches: { some: { active: true, branch: { active: true } } },
      },
      orderBy: [{ priceBalls: "asc" }, { id: "asc" }],
    });
    const goals = catalog.map((g) => ({
      id: g.id,
      nameUz: g.nameUz,
      nameRu: g.nameRu ?? g.nameUz,
      targetBalls: g.priceBalls,
      rewardPriceSom: g.menuPriceSom,
    }));
    const activeGoal =
      goals
        .map((goal) => ({
          ...goal,
          progress: rewardGoalProgress(
            Math.max(0, current.availableUnits),
            goal.targetBalls,
          ),
        }))
        .find((goal) => !goal.progress.canRedeem) ??
      goals
        .map((goal) => ({
          ...goal,
          progress: rewardGoalProgress(
            Math.max(0, current.availableUnits),
            goal.targetBalls,
          ),
        }))
        .at(-1);

    return {
      customerId,
      totalBalls: Math.floor(
        Math.max(0, current.totalUnits) / current.unitsPerBall,
      ),
      availableBalls: current.availableBalls,
      reservedBalls: current.reservedBalls,
      totalUnits: current.totalUnits,
      availableUnits: current.availableUnits,
      nextBallProgressPercent: current.nextBallProgressPercent,
      remainingToNextBall: current.remainingToNextBall,
      nextGoal: activeGoal
        ? {
            id: activeGoal.id,
            titleUz: activeGoal.nameUz,
            titleRu: activeGoal.nameRu,
            targetBalls: activeGoal.targetBalls,
            targetSom: activeGoal.targetBalls * current.unitsPerBall,
            menuPriceSom: activeGoal.rewardPriceSom,
            progress: activeGoal.progress,
          }
        : null,
      goals: goals.map((goal) => ({
        id: goal.id,
        titleUz: goal.nameUz,
        titleRu: goal.nameRu,
        targetBalls: goal.targetBalls,
        targetSom: goal.targetBalls * current.unitsPerBall,
        menuPriceSom: goal.rewardPriceSom,
        progress: rewardGoalProgress(
          Math.max(0, current.availableUnits),
          goal.targetBalls,
        ),
      })),
      referralPayload: `ref_${customer.telegramUserId}`,
    };
  });

  app.post("/customers/:customerId/receipts", async (req, reply) => {
    const receivedAt = new Date();
    const { customerId } = z.object({ customerId: id }).parse(req.params);
    const c = await customerAuth(req, customerId);
    requireThat(!c.blocked, "Mijoz bloklangan", 403);
    const b = z
      .object({
        imageBase64: z.string().max(12_000_000),
        branchId: id,
        idempotencyKey: key,
      })
      .parse(req.body);
    const image = await decodeImage(b.imageBase64);
    const storageKey = `receipts/${randomUUID()}`;
    const result = await atomic((tx) =>
      once(
        tx,
        `upload:${customerId}:${b.idempotencyKey}`,
        { hash: image.imageHash, branchId: b.branchId },
        async () => {
          const existing = await tx.receipt.findUnique({
            where: { imageHash: image.imageHash },
          });
          requireThat(!existing, "Bu chek tizimda oldin yuborilgan", 409);
          requireThat(
            await tx.branch.count({ where: { id: b.branchId, active: true } }),
            "Filial mavjud emas",
          );
          const recent = await tx.receipt.findMany({
            where: {
              createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
              perceptualHash: { not: null },
            },
            select: { id: true, perceptualHash: true },
            take: 1000,
            orderBy: { createdAt: "desc" },
          });
          const flags = recent
            .filter(
              (r) => distance(image.perceptualHash, r.perceptualHash!) <= 5,
            )
            .map((r) => ({ receiptId: r.id, kind: "SIMILAR_IMAGE" }));
          await upload(storageKey, image.buffer, image.contentType);
          const r = await tx.receipt.create({
            data: {
              customerId,
              branchId: b.branchId,
              imageStorageKey: storageKey,
              imageHash: image.imageHash,
              perceptualHash: image.perceptualHash,
              duplicateFlags: json(flags),
              status: "RECEIVED",
              firstReceivedAt: receivedAt,
            },
          });
          return { receiptId: r.id, status: r.status };
        },
      ),
    );
    return reply.code(201).send(result);
  });
  app.post("/customers/:customerId/reservations", async (req) => {
    const { customerId } = z.object({ customerId: id }).parse(req.params);
    await customerAuth(req, customerId);
    const b = z
      .object({ giftId: id, branchId: id, idempotencyKey: key })
      .parse(req.body);
    return reserveGift(customerId, b.giftId, b.branchId, b.idempotencyKey);
  });
  app.post("/customers/:customerId/reservations/cancel", async (req) => {
    const { customerId } = z.object({ customerId: id }).parse(req.params);
    await customerAuth(req, customerId);
    return atomic(async (tx) => {
      await tx.giftReservation.updateMany({
        where: { customerId, status: "ACTIVE" },
        data: { status: "CANCELLED" },
      });
      return { ok: true };
    });
  });
  app.get("/bot/customers/:customerId/reservations/active", async (req) => {
    const { customerId } = z.object({ customerId: id }).parse(req.params);
    await customerAuth(req, customerId);
    return prisma.giftReservation.findMany({
      where: { customerId, status: "ACTIVE", expiresAt: { gt: new Date() } },
      select: {
        id: true,
        expiresAt: true,
        priceBallsAtReserve: true,
        gift: { select: { nameUz: true, nameRu: true } },
      },
    });
  });
  app.get("/bot/customers/:customerId/history", async (req) => {
    const { customerId } = z.object({ customerId: id }).parse(req.params);
    await customerAuth(req, customerId);
    const q = z
      .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
      .parse(req.query);
    return prisma.ledgerEntry.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: q.limit,
      select: {
        type: true,
        unitsDelta: true,
        reasonNote: true,
        createdAt: true,
      },
    });
  });
  app.post("/bot/customers/:customerId/feedback", async (req) => {
    const { customerId } = z.object({ customerId: id }).parse(req.params);
    await customerAuth(req, customerId);
    const b = z
      .object({
        message: z.string().trim().min(2).max(2000),
        idempotencyKey: key,
      })
      .parse(req.body);
    return atomic((tx) =>
      once(tx, `feedback:${customerId}:${b.idempotencyKey}`, b, async () => {
        const f = await tx.feedback.create({
          data: { customerId, message: b.message },
        });
        const admins = await tx.staffUser.findMany({
          where: { role: "SUPER_ADMIN", active: true },
        });
        for (const a of admins)
          await tx.outbox.create({
            data: {
              key: `feedback:${f.id}:${a.id}`,
              telegramId: String(a.telegramUserId),
              text: `Yangi fikr #${f.id}: ${b.message}`,
            },
          });
        return { id: f.id };
      }),
    );
  });
  app.patch("/bot/customers/:customerId/locale", async (req) => {
    const { customerId } = z.object({ customerId: id }).parse(req.params);
    await customerAuth(req, customerId);
    const b = z.object({ locale: z.enum(["uz", "ru"]) }).parse(req.body);
    await prisma.customer.update({ where: { id: customerId }, data: b });
    return { ok: true };
  });
  app.patch("/bot/customers/:customerId/preferences", async (req) => {
    const { customerId } = z.object({ customerId: id }).parse(req.params);
    await customerAuth(req, customerId);
    const b = z
      .object({
        marketingConsent: z.boolean().optional(),
        birthDayMonth: birthday,
        requestDeletion: z.boolean().optional(),
      })
      .parse(req.body);
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        marketingConsentAt:
          b.marketingConsent === true ? new Date() : undefined,
        marketingUnsubscribed:
          b.marketingConsent === undefined ? undefined : !b.marketingConsent,
        birthDate:
          b.birthDayMonth === null
            ? null
            : b.birthDayMonth
              ? new Date(`2000-${b.birthDayMonth}T00:00:00Z`)
              : undefined,
        deletionRequestedAt: b.requestDeletion ? new Date() : undefined,
      },
    });
    return { ok: true };
  });
  app.get("/bot/sessions/:sessionKey", async (req) => {
    const { sessionKey } = z
      .object({ sessionKey: z.string().regex(/^\d{1,20}$/) })
      .parse(req.params);
    requireThat(
      sessionKey === req.headers["x-telegram-user-id"],
      "Sessiyaga ruxsat yo‘q",
      403,
    );
    const [row] = await Promise.all([
      prisma.botSession.findUnique({
        where: { key: sessionKey },
      }),
      // A new private Telegram update proves the user can interact with the bot again.
      prisma.customer.updateMany({
        where: { telegramUserId: BigInt(sessionKey), telegramBlocked: true },
        data: { telegramBlocked: false },
      }),
    ]);
    return row ? unseal(row.value) : null;
  });
  app.put("/bot/sessions/:sessionKey", async (req) => {
    const { sessionKey } = z.object({ sessionKey: id }).parse(req.params);
    requireThat(
      sessionKey === req.headers["x-telegram-user-id"],
      "Sessiyaga ruxsat yo‘q",
      403,
    );
    await prisma.botSession.upsert({
      where: { key: sessionKey },
      update: { value: seal(req.body) },
      create: { key: sessionKey, value: seal(req.body) },
    });
    return { ok: true };
  });
}
