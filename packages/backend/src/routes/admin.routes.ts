import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  prisma,
  atomic,
  once,
  audit,
  notify,
  requireThat,
  id,
  key,
  money,
  safeUrl,
  settings,
  defaultSettings,
  json,
} from "../core.js";
import {
  staff,
  allRoles,
  managers,
  reviewers,
  branchFilter,
  branchAccess,
  type Staff,
} from "../auth/access.js";
import {
  approveReceipt,
  reverseReceipt,
  balance,
  credit,
  consume,
} from "../services/points.service.js";
import { signedImage } from "../storage.js";
const reason = z.string().trim().min(3).max(1000);
const params = z.object({ id });
const approval = z.object({
  purchaseSom: money.positive(),
  purchasedAt: z.string().datetime({ offset: true }),
  branchId: id,
  tillId: z.string().trim().min(1).max(120),
  externalSaleId: z.string().trim().min(1).max(120),
  reason,
  saleVerified: z.literal(true),
  paid: z.literal(true),
  refunded: z.literal(false),
  isDiscountedSet: z.boolean(),
  bonusEligible: z.boolean(),
  idempotencyKey: key,
});
const giftSchema = z.object({
  nameUz: z.string().min(2).max(100),
  nameRu: z.string().max(100).nullable().optional(),
  descriptionUz: z.string().max(1000).nullable().optional(),
  descriptionRu: z.string().max(1000).nullable().optional(),
  imageUrl: safeUrl.nullable().optional(),
  priceBalls: z.number().int().min(1).max(1000),
  menuPriceSom: money,
  realCostSom: money.nullable(),
  active: z.boolean(),
  temporarilyUnavailable: z.boolean(),
  dailyLimit: z.number().int().min(0).max(100000).nullable(),
  branchIds: z.array(id).min(1),
});
const campaignSchema = z
  .object({
    nameUz: z.string().min(2).max(120),
    kind: z.enum([
      "SECOND_PURCHASE_7D",
      "REFERRAL_FIRST_PURCHASE",
      "AMOUNT_TIER",
      "WINBACK_21D",
      "BIRTHDAY_WINDOW",
      "OFF_PEAK_MULTIPLIER",
    ]),
    bonusPercent: z.number().int().min(0).max(100).nullable(),
    multiplierNum: z.number().int().min(1).max(10).nullable(),
    multiplierDen: z.number().int().min(1).max(10).nullable(),
    minAmountSom: money.nullable(),
    active: z.boolean(),
    startsAt: z.string().datetime().nullable(),
    endsAt: z.string().datetime().nullable(),
    audienceNote: z.string().max(1000).nullable(),
    budgetSom: money.nullable(),
    usageLimitTotal: z.number().int().min(1).nullable(),
    usageLimitPerCustomer: z.number().int().min(1).nullable(),
    config: z.object({
      hours: z.array(z.number().int().min(0).max(23)).default([]),
      branchIds: z.array(id).default([]),
    }),
  })
  .refine(
    (b) => !b.startsAt || !b.endsAt || b.startsAt < b.endsAt,
    "Boshlanish tugashdan oldin bo‘lsin",
  );
async function customerScope(s: Staff, customerId: string) {
  if (s.role !== "SUPER_ADMIN")
    requireThat(
      await prisma.receipt.count({ where: { customerId, ...branchFilter(s) } }),
      "Mijoz bu filialga tegishli emas",
      403,
    );
}
export function registerAdminRoutes(app: FastifyInstance) {
  app.get("/admin/me", async (req) => {
    const s = await staff(req, allRoles);
    return {
      id: s.id,
      name: s.fullName,
      role: s.role,
      branchIds: s.branchAccess.map((b) => b.branchId),
    };
  });
  app.get("/admin/branches", async (req) => {
    const s = await staff(req, allRoles);
    return prisma.branch.findMany({
      where:
        s.role === "SUPER_ADMIN"
          ? {}
          : { id: { in: s.branchAccess.map((b) => b.branchId) } },
      orderBy: { name: "asc" },
    });
  });
  app.post("/admin/branches", async (req) => {
    const s = await staff(req, ["SUPER_ADMIN"]);
    const b = z
      .object({
        id: id.optional(),
        name: z.string().min(2).max(100),
        address: z.string().max(300).nullable(),
        active: z.boolean(),
      })
      .parse(req.body);
    return atomic(async (tx) => {
      const before = b.id
        ? await tx.branch.findUnique({ where: { id: b.id } })
        : null;
      const row = b.id
        ? await tx.branch.update({ where: { id: b.id }, data: b })
        : await tx.branch.create({ data: b });
      await audit(tx, s.id, "SAVE_BRANCH", "Branch", row.id, before, row);
      return row;
    });
  });
  app.get("/admin/receipts", async (req) => {
    const s = await staff(req, reviewers);
    const q = z
      .object({
        status: z
          .enum([
            "RECEIVED",
            "READING",
            "PENDING_REVIEW",
            "APPROVED",
            "REJECTED",
            "REVERSED",
          ])
          .optional(),
        skip: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    return prisma.receipt.findMany({
      where: { ...branchFilter(s), status: q.status },
      include: {
        customer: { select: { fullName: true } },
        branch: { select: { name: true } },
      },
      orderBy: { firstReceivedAt: "desc" },
      take: 50,
      skip: q.skip,
    });
  });
  app.get("/admin/receipts/:id", async (req) => {
    const s = await staff(req, reviewers);
    const { id: receiptId } = params.parse(req.params);
    const r = await prisma.receipt.findUniqueOrThrow({
      where: { id: receiptId },
      include: {
        customer: { select: { fullName: true } },
        ledgerEntries: true,
      },
    });
    branchAccess(s, r.branchId);
    const logs = await prisma.auditLog.findMany({
      where: { entityType: "Receipt", entityId: r.id },
      orderBy: { createdAt: "asc" },
    });
    return {
      ...r,
      imageUrl:
        r.imageStorageKey === "PURGED"
          ? null
          : await signedImage(r.imageStorageKey),
      audit: logs,
    };
  });
  app.post("/admin/receipts/:id/approve", async (req) => {
    const s = await staff(req, reviewers);
    return approveReceipt(
      params.parse(req.params).id,
      approval.parse(req.body),
      s,
    );
  });
  app.post("/admin/receipts/:id/reject", async (req) => {
    const s = await staff(req, reviewers);
    const receiptId = params.parse(req.params).id;
    const b = z.object({ reason }).parse(req.body);
    return atomic(async (tx) => {
      const r = await tx.receipt.findUniqueOrThrow({
        where: { id: receiptId },
      });
      branchAccess(s, r.branchId);
      requireThat(
        r.status === "PENDING_REVIEW",
        "Chek tekshiruv holatida emas",
        409,
      );
      await tx.receipt.update({
        where: { id: r.id },
        data: {
          status: "REJECTED",
          rejectionReason: b.reason,
          reviewedAt: new Date(),
          reviewedByStaffId: s.id,
        },
      });
      await audit(tx, s.id, "REJECT_RECEIPT", "Receipt", r.id, r, b);
      await notify(
        tx,
        r.customerId,
        `Chek rad etildi: ${b.reason}`,
        `rejected:${r.id}`,
        `Чек отклонён: ${b.reason}`,
      );
      return { ok: true };
    });
  });
  app.post("/admin/receipts/:id/reverse", async (req) => {
    const s = await staff(req, managers);
    return reverseReceipt(
      params.parse(req.params).id,
      z.object({ reason }).parse(req.body).reason,
      s,
    );
  });
  app.get("/admin/customers", async (req) => {
    const s = await staff(req, managers);
    const q = z
      .object({
        search: z.string().max(100).default(""),
        skip: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    return prisma.customer.findMany({
      where: {
        AND: [
          {
            OR: [
              { fullName: { contains: q.search, mode: "insensitive" } },
              { phoneE164: { contains: q.search } },
            ],
          },
          s.role === "SUPER_ADMIN"
            ? {}
            : { receipts: { some: branchFilter(s) } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      skip: q.skip,
    });
  });
  app.get("/admin/customers/:id", async (req) => {
    const s = await staff(req, managers);
    const customerId = params.parse(req.params).id;
    await customerScope(s, customerId);
    const c = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    return {
      ...c,
      balance: await balance(c.id),
      ledger: await prisma.ledgerEntry.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    };
  });
  app.post("/admin/customers/:id/block", async (req) => {
    const s = await staff(req, managers);
    const customerId = params.parse(req.params).id;
    await customerScope(s, customerId);
    const b = z.object({ blocked: z.boolean(), reason }).parse(req.body);
    return atomic(async (tx) => {
      const before = await tx.customer.findUniqueOrThrow({
        where: { id: customerId },
      });
      await tx.customer.update({
        where: { id: customerId },
        data: { blocked: b.blocked, blockedReason: b.reason },
      });
      if (b.blocked)
        await tx.giftReservation.updateMany({
          where: { customerId, status: "ACTIVE" },
          data: { status: "CANCELLED" },
        });
      await audit(
        tx,
        s.id,
        "BLOCK_CUSTOMER",
        "Customer",
        customerId,
        before,
        b,
      );
      return { ok: true };
    });
  });
  app.post("/admin/customers/:id/adjust-balance", async (req) => {
    const s = await staff(req, ["SUPER_ADMIN"]);
    const customerId = params.parse(req.params).id;
    const b = z
      .object({
        unitsDelta: z
          .number()
          .int()
          .min(-1_000_000_000)
          .max(1_000_000_000)
          .refine((n) => n !== 0),
        reasonNote: reason,
        idempotencyKey: key,
      })
      .parse(req.body);
    return atomic((tx) =>
      once(
        tx,
        `adjust:${s.id}:${b.idempotencyKey}`,
        { customerId, ...b },
        async () => {
          const before = await balance(customerId, tx);
          if (b.unitsDelta > 0)
            await credit(
              tx,
              customerId,
              b.unitsDelta,
              "MANUAL_ADJUSTMENT",
              `adjust:${s.id}:${b.idempotencyKey}`,
              undefined,
              b.reasonNote,
            );
          else {
            await tx.ledgerEntry.create({
              data: {
                customerId,
                type: "MANUAL_ADJUSTMENT",
                unitsDelta: b.unitsDelta,
                reasonNote: b.reasonNote,
                createdByStaffId: s.id,
              },
            });
            await consume(tx, customerId, -b.unitsDelta);
            await tx.giftReservation.updateMany({
              where: { customerId, status: "ACTIVE" },
              data: { status: "CANCELLED" },
            });
          }
          const after = await balance(customerId, tx);
          await tx.customer.update({
            where: { id: customerId },
            data: { riskHold: after.totalUnits < 0 },
          });
          await audit(
            tx,
            s.id,
            "ADJUST_BALANCE",
            "Customer",
            customerId,
            before,
            { ...b, ...after },
          );
          return after;
        },
      ),
    );
  });
  app.get("/admin/gifts", async (req) => {
    await staff(req, managers);
    return prisma.gift.findMany({
      include: { branches: true },
      orderBy: { priceBalls: "asc" },
    });
  });
  app.post("/admin/gifts", async (req) => {
    const s = await staff(req, ["SUPER_ADMIN"]);
    const b = giftSchema.extend({ id: id.optional() }).parse(req.body);
    return atomic(async (tx) => {
      const { branchIds, id: giftId, ...data } = b;
      const before = giftId
        ? await tx.gift.findUnique({
            where: { id: giftId },
            include: { branches: true },
          })
        : null;
      const row = giftId
        ? await tx.gift.update({ where: { id: giftId }, data })
        : await tx.gift.create({ data });
      await tx.giftBranch.deleteMany({ where: { giftId: row.id } });
      await tx.giftBranch.createMany({
        data: branchIds.map((branchId) => ({ giftId: row.id, branchId })),
        skipDuplicates: true,
      });
      await audit(tx, s.id, "SAVE_GIFT", "Gift", row.id, before, b);
      return row;
    });
  });
  app.post("/admin/gifts/:id/availability", async (req) => {
    const s = await staff(req, managers);
    const giftId = params.parse(req.params).id;
    const b = z.object({ branchId: id, active: z.boolean() }).parse(req.body);
    branchAccess(s, b.branchId);
    return atomic(async (tx) => {
      const before = await tx.giftBranch.findUniqueOrThrow({
        where: { giftId_branchId: { giftId, branchId: b.branchId } },
      });
      const after = await tx.giftBranch.update({
        where: { id: before.id },
        data: { active: b.active },
      });
      await audit(tx, s.id, "GIFT_AVAILABILITY", "Gift", giftId, before, after);
      return after;
    });
  });
  app.get("/admin/campaigns", async (req) => {
    await staff(req, managers);
    return prisma.campaign.findMany({ orderBy: { createdAt: "asc" } });
  });
  app.post("/admin/campaigns", async (req) => {
    const s = await staff(req, managers);
    const raw = z.object({ id: id.optional() }).passthrough().parse(req.body);
    const b = campaignSchema.parse(raw);
    if (s.role !== "SUPER_ADMIN")
      requireThat(
        b.config.branchIds.length > 0 &&
          b.config.branchIds.every((x) =>
            s.branchAccess.some((y) => y.branchId === x),
          ),
        "Faqat o‘z filiallaringiz uchun aksiya yarating",
        403,
      );
    return atomic(async (tx) => {
      const before = raw.id
        ? await tx.campaign.findUnique({ where: { id: raw.id } })
        : null;
      if (before && s.role !== "SUPER_ADMIN") {
        const branches = (before.config as any).branchIds ?? [];
        requireThat(
          branches.length &&
            branches.every((x: string) =>
              s.branchAccess.some((y) => y.branchId === x),
            ),
          "Global yoki boshqa filial aksiyasini tahrirlab bo‘lmaydi",
          403,
        );
      }
      const data = {
        ...b,
        startsAt: b.startsAt ? new Date(b.startsAt) : null,
        endsAt: b.endsAt ? new Date(b.endsAt) : null,
      };
      const row = raw.id
        ? await tx.campaign.update({ where: { id: raw.id }, data })
        : await tx.campaign.create({ data });
      await audit(tx, s.id, "SAVE_CAMPAIGN", "Campaign", row.id, before, row);
      return row;
    });
  });
  app.get("/admin/staff", async (req) => {
    await staff(req, ["SUPER_ADMIN"]);
    return prisma.staffUser.findMany({
      include: { branchAccess: true },
      orderBy: { createdAt: "desc" },
    });
  });
  app.post("/admin/staff", async (req) => {
    const s = await staff(req, ["SUPER_ADMIN"]);
    const b = z
      .object({
        telegramUserId: z.string().regex(/^\d+$/),
        fullName: z.string().min(2).max(100),
        role: z.enum(["SUPER_ADMIN", "MANAGER", "RECEIPT_REVIEWER", "CASHIER"]),
        active: z.boolean(),
        branchIds: z.array(id),
      })
      .parse(req.body);
    requireThat(
      b.telegramUserId !== String(s.telegramUserId) ||
        (b.active && b.role === "SUPER_ADMIN"),
      "O‘zingizning bosh admin huquqingizni olib tashlamang",
    );
    return atomic(async (tx) => {
      const before = await tx.staffUser.findUnique({
        where: { telegramUserId: BigInt(b.telegramUserId) },
      });
      const data = {
        telegramUserId: BigInt(b.telegramUserId),
        fullName: b.fullName,
        role: b.role,
        active: b.active,
      };
      const row = await tx.staffUser.upsert({
        where: { telegramUserId: data.telegramUserId },
        update: data,
        create: data,
      });
      await tx.staffBranchAccess.deleteMany({ where: { staffUserId: row.id } });
      await tx.staffBranchAccess.createMany({
        data: b.branchIds.map((branchId) => ({
          staffUserId: row.id,
          branchId,
        })),
        skipDuplicates: true,
      });
      await audit(tx, s.id, "SAVE_STAFF", "StaffUser", row.id, before, row);
      return json(row);
    });
  });
  app.get("/admin/audit", async (req) => {
    await staff(req, ["SUPER_ADMIN"]);
    const q = z
      .object({ skip: z.coerce.number().int().min(0).default(0) })
      .parse(req.query);
    return prisma.auditLog.findMany({
      include: { staffUser: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      skip: q.skip,
    });
  });
  app.get("/admin/feedback", async (req) => {
    await staff(req, ["SUPER_ADMIN"]);
    return prisma.feedback.findMany({
      include: { customer: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
  app.get("/admin/settings", async (req) => {
    await staff(req, ["SUPER_ADMIN"]);
    return settings();
  });
  app.post("/admin/settings", async (req) => {
    const s = await staff(req, ["SUPER_ADMIN"]);
    const b = z
      .object({
        unitsPerBall: z.literal(100000),
        qrSeconds: z.number().int().min(30).max(180),
        receiptMinutes: z.number().int().min(1).max(120),
        weeklyAdLimit: z.number().int().min(0).max(2),
        quietStart: z.number().int().min(18).max(23),
        quietEnd: z.number().int().min(6).max(12),
        pointExpiryDays: z.number().int().min(0).max(3650),
        receiptRetentionDays: z.number().int().min(30).max(3650),
        bonusCostSomPerBall: money,
        externalMonthlyCostSom: money,
        autoApproveEnabled: z.number().int().min(0).max(1),
        autoApproveMinConfidence: z.number().int().min(0).max(100),
        autoApproveMinAmountSom: money,
        autoApproveMaxAmountSom: money,
      })
      .parse(req.body);
    return atomic(async (tx) => {
      const before = await settings(tx);
      await tx.appSetting.upsert({
        where: { key: "business" },
        update: { value: b },
        create: { key: "business", value: b },
      });
      await audit(
        tx,
        s.id,
        "SAVE_SETTINGS",
        "AppSetting",
        "business",
        before,
        b,
      );
      return b;
    });
  });
  app.get("/admin/reports/summary", async (req) => {
    const s = await staff(req, managers);
    const where = { ...branchFilter(s), status: "APPROVED" as const };
    const receipts = await prisma.receipt.findMany({ where });
    const customerIds = [...new Set(receipts.map((r) => r.customerId))];
    const scoped =
      s.role === "SUPER_ADMIN" ? {} : { customerId: { in: customerIds } };
    const ledger = await prisma.ledgerEntry.findMany({ where: scoped });
    const cfg = await settings();
    const reservations = await prisma.giftReservation.findMany({
      where: { ...branchFilter(s), status: "REDEEMED" },
    });
    const active = await prisma.giftReservation.findMany({
      where: {
        ...branchFilter(s),
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
    });
    const perCustomer = new Map<string, number>();
    for (const entry of ledger)
      perCustomer.set(
        entry.customerId,
        (perCustomer.get(entry.customerId) ?? 0) + entry.unitsDelta,
      );
    // One customer's debt cannot offset gifts owed to other customers.
    const total = [...perCustomer.values()].reduce(
      (sum, units) => sum + Math.max(0, units),
      0,
    );
    return {
      approvedReceiptsSumSom: receipts.reduce(
        (s, r) => s + (r.confirmedAmountSom ?? 0),
        0,
      ),
      totalCustomers:
        s.role === "SUPER_ADMIN"
          ? await prisma.customer.count()
          : customerIds.length,
      repeatCustomers: customerIds.filter(
        (c) => receipts.filter((r) => r.customerId === c).length > 1,
      ).length,
      ballsIssued:
        ledger
          .filter((e) => e.unitsDelta > 0)
          .reduce((s, e) => s + e.unitsDelta, 0) / cfg.unitsPerBall,
      ballsSpent:
        -ledger
          .filter((e) => e.type === "REDEMPTION")
          .reduce((s, e) => s + e.unitsDelta, 0) / cfg.unitsPerBall,
      ballsReserved: active.reduce((s, r) => s + r.priceBallsAtReserve, 0),
      outstandingBalls: total / cfg.unitsPerBall,
      debtUnits: [...perCustomer.values()].reduce(
        (sum, units) => sum + Math.max(0, -units),
        0,
      ),
      estimatedLiabilitySom:
        (Math.max(total, 0) * cfg.bonusCostSomPerBall) / cfg.unitsPerBall,
      giftsGiven: reservations.length,
      giftMenuValueSom: reservations.reduce(
        (s, r) => s + r.menuPriceSomAtReserve,
        0,
      ),
      knownGiftCostSom: reservations.reduce(
        (s, r) => s + (r.realCostSomAtReserve ?? 0),
        0,
      ),
      missingCostCount: reservations.filter(
        (r) => r.realCostSomAtReserve === null,
      ).length,
      externalMonthlyCostSom: cfg.externalMonthlyCostSom,
      campaignUsage: await prisma.campaignUsage.groupBy({
        by: ["campaignId"],
        where: { reversed: false, ...scoped },
        _sum: { units: true, costSom: true },
        _count: true,
      }),
      posStatus: "NOT_CONFIGURED",
      scopeNote:
        s.role === "SUPER_ADMIN"
          ? "Barcha filiallar"
          : "Filial cheklari; mijoz ballari umumiy hisob bo‘yicha",
    };
  });
  // Defaults are exported through settings; no endpoint can erase ledger or audit.
  void defaultSettings;
}
