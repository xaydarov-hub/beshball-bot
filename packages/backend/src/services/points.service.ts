import type { LedgerEntryType } from "@prisma/client";
import {
  prisma,
  type Tx,
  atomic,
  requireThat,
  once,
  audit,
  notify,
  settings,
  monthStart,
  localParts,
} from "../core.js";
import {
  isReceiptWithinAcceptanceWindow,
  applyRationalMultiplier,
} from "@beshball/shared";
import type { Staff } from "../auth/access.js";
import { branchAccess } from "../auth/access.js";
export async function balance(customerId: string, tx: Tx = prisma) {
  const [cfg, entries, reservations, purchase] = await Promise.all([
    settings(tx),
    tx.ledgerEntry.groupBy({
      by: ["type"],
      where: { customerId },
      _sum: { unitsDelta: true },
    }),
    tx.giftReservation.findMany({
      where: { customerId, status: "ACTIVE", expiresAt: { gt: new Date() } },
    }),
    tx.receipt.aggregate({
      where: { customerId, status: "APPROVED" },
      _sum: { confirmedAmountSom: true },
    }),
  ]);
  const totalUnits = entries.reduce((s, e) => s + (e._sum.unitsDelta ?? 0), 0);
  const reservedUnits = reservations.reduce(
    (s, r) => s + r.priceBallsAtReserve * cfg.unitsPerBall,
    0,
  );
  const availableUnits = totalUnits - reservedUnits;
  const get = (types: string[]) =>
    entries
      .filter((e) => types.includes(e.type))
      .reduce((s, e) => s + (e._sum.unitsDelta ?? 0), 0);
  const progress = Math.max(0, totalUnits) % cfg.unitsPerBall;
  return {
    totalUnits,
    reservedUnits,
    availableUnits,
    availableBalls: Math.floor(Math.max(0, availableUnits) / cfg.unitsPerBall),
    reservedBalls: reservedUnits / cfg.unitsPerBall,
    nextBallProgressPercent: Math.floor((progress * 100) / cfg.unitsPerBall),
    nextBallProgressUnits: progress,
    remainingToNextBall: cfg.unitsPerBall - progress,
    purchaseUnits: get(["PURCHASE_BASE"]),
    bonusUnits: get(["PURCHASE_BONUS", "REFERRAL_BONUS"]),
    spentUnits: -get(["REDEMPTION"]),
    historicalPurchaseSom: purchase._sum.confirmedAmountSom ?? 0,
    unitsPerBall: cfg.unitsPerBall,
  };
}
export async function credit(
  tx: Tx,
  customerId: string,
  units: number,
  type: LedgerEntryType,
  operationKey: string,
  receiptId?: string,
  reasonNote?: string,
) {
  requireThat(
    Number.isSafeInteger(units) && units >= 0 && units <= 2_000_000_000,
    "Birlik chegarasi noto‘g‘ri",
  );
  if (!units) return;
  const old = await tx.ledgerEntry.aggregate({
    where: { customerId },
    _sum: { unitsDelta: true },
  });
  const debt = Math.max(0, -(old._sum.unitsDelta ?? 0));
  const e = await tx.ledgerEntry.create({
    data: {
      customerId,
      unitsDelta: units,
      type,
      operationKey,
      relatedReceiptId: receiptId,
      reasonNote,
    },
  });
  const cfg = await settings(tx);
  await tx.pointLot.create({
    data: {
      customerId,
      receiptId,
      ledgerId: e.id,
      remaining: Math.max(0, units - debt),
      expiresAt:
        cfg.pointExpiryDays > 0
          ? new Date(Date.now() + cfg.pointExpiryDays * 86400000)
          : null,
    },
  });
}
export async function consume(tx: Tx, customerId: string, units: number) {
  const lots = await tx.pointLot.findMany({
    where: { customerId, remaining: { gt: 0 } },
    orderBy: [
      { expiresAt: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
  });
  for (const lot of lots) {
    const n = Math.min(lot.remaining, units);
    await tx.pointLot.update({
      where: { id: lot.id },
      data: { remaining: { decrement: n } },
    });
    units -= n;
    if (!units) break;
  }
}
async function selectCampaign(
  tx: Tx,
  customerId: string,
  amount: number,
  purchasedAt: Date,
  eligible: boolean,
  branchId: string,
) {
  if (!eligible) return null;
  const cfg = await settings(tx);
  const customer = await tx.customer.findUniqueOrThrow({
    where: { id: customerId },
  });
  const previous = await tx.receipt.findMany({
    where: { customerId, status: "APPROVED" },
    orderBy: { confirmedPurchasedAt: "asc" },
  });
  const campaigns = await tx.campaign.findMany({
    where: {
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: purchasedAt } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: purchasedAt } }] },
      ],
    },
  });
  const candidates = [];
  for (const c of campaigns) {
    if (amount < (c.minAmountSom ?? 0)) continue;
    const config = c.config as Record<string, any>;
    if (
      Array.isArray(config.branchIds) &&
      config.branchIds.length &&
      !config.branchIds.includes(branchId)
    )
      continue;
    let ok = false,
      referrer: string | undefined;
    if (c.kind === "AMOUNT_TIER") ok = true;
    if (c.kind === "SECOND_PURCHASE_7D")
      ok =
        previous.length === 1 &&
        purchasedAt.getTime() -
          (previous[0].confirmedPurchasedAt?.getTime() ?? 0) >=
          0 &&
        purchasedAt.getTime() -
          (previous[0].confirmedPurchasedAt?.getTime() ?? 0) <=
          7 * 86400000;
    if (c.kind === "WINBACK_21D")
      ok =
        previous.length > 0 &&
        purchasedAt.getTime() -
          (previous.at(-1)?.confirmedPurchasedAt?.getTime() ?? Infinity) >=
          21 * 86400000;
    if (c.kind === "BIRTHDAY_WINDOW" && customer.birthDate) {
      const p = localParts(purchasedAt);
      const b = customer.birthDate;
      ok =
        Math.min(
          ...[p.year - 1, p.year, p.year + 1].map(
            (y) =>
              Math.abs(
                Date.UTC(y, b.getUTCMonth(), b.getUTCDate()) -
                  Date.UTC(p.year, p.month, p.day),
              ) / 86400000,
          ),
        ) <= 3;
    }
    if (c.kind === "OFF_PEAK_MULTIPLIER") {
      const p = localParts(purchasedAt);
      ok = Array.isArray(config.hours) && config.hours.includes(p.hour);
    }
    if (
      c.kind === "REFERRAL_FIRST_PURCHASE" &&
      previous.length === 0 &&
      customer.referredByCustomerId &&
      customer.referredByCustomerId !== customer.id
    ) {
      const r = await tx.customer.findUnique({
        where: { id: customer.referredByCustomerId },
      });
      const n = await tx.campaignUsage.count({
        where: {
          referrerCustomerId: customer.referredByCustomerId,
          createdAt: { gte: monthStart() },
          reversed: false,
        },
      });
      ok = !!r && !r.blocked && n < 5;
      if (ok) referrer = customer.referredByCustomerId;
    }
    if (!ok) continue;
    const usages = await tx.campaignUsage.findMany({
      where: { campaignId: c.id, reversed: false },
    });
    if (c.usageLimitTotal !== null && usages.length >= c.usageLimitTotal)
      continue;
    if (
      c.usageLimitPerCustomer !== null &&
      usages.filter((u) => u.customerId === customerId).length >=
        c.usageLimitPerCustomer
    )
      continue;
    const units =
      c.kind === "OFF_PEAK_MULTIPLIER"
        ? applyRationalMultiplier(amount, {
            num: c.multiplierNum ?? 1,
            den: c.multiplierDen ?? 1,
          }) - amount
        : Math.floor((cfg.unitsPerBall * (c.bonusPercent ?? 0)) / 100);
    if (units <= 0) continue;
    const costSom = Math.ceil(
      (units * (referrer ? 2 : 1) * cfg.bonusCostSomPerBall) / cfg.unitsPerBall,
    );
    if (
      c.budgetSom !== null &&
      usages.reduce((s, u) => s + u.costSom, 0) + costSom > c.budgetSom
    )
      continue;
    candidates.push({ campaign: c, units, costSom, referrer });
  }
  return (
    candidates.sort(
      (a, b) => b.units - a.units || a.campaign.id.localeCompare(b.campaign.id),
    )[0] ?? null
  );
}
export interface Approval {
  purchaseSom: number;
  purchasedAt: string;
  branchId: string;
  tillId: string;
  externalSaleId: string;
  reason: string;
  saleVerified: boolean;
  paid: boolean;
  refunded: boolean;
  isDiscountedSet: boolean;
  bonusEligible: boolean;
  idempotencyKey: string;
}
export async function approveReceipt(
  receiptId: string,
  input: Approval,
  staff: Staff,
) {
  return atomic((tx) =>
    once(
      tx,
      `approve:${staff.id}:${input.idempotencyKey}`,
      { receiptId, ...input },
      async () => {
        const receipt = await tx.receipt.findUniqueOrThrow({
          where: { id: receiptId },
        });
        branchAccess(staff, input.branchId);
        if (receipt.branchId) branchAccess(staff, receipt.branchId);
        requireThat(
          receipt.status === "PENDING_REVIEW",
          "Chek tekshiruv holatida emas",
          409,
        );
        const c = await tx.customer.findUniqueOrThrow({
          where: { id: receipt.customerId },
        });
        requireThat(!c.blocked, "Mijoz bloklangan");
        requireThat(
          input.saleVerified && input.paid && !input.refunded,
          "Faqat kafening haqiqiy to‘langan va qaytarilmagan savdosini tasdiqlang",
        );
        const date = new Date(input.purchasedAt);
        const cfg = await settings(tx);
        requireThat(
          isReceiptWithinAcceptanceWindow(
            receipt.firstReceivedAt.getTime(),
            date.getTime(),
            cfg.receiptMinutes,
          ),
          "Chek vaqti qabul qilish muddatiga mos emas",
        );
        const branch = await tx.branch.findUniqueOrThrow({
          where: { id: input.branchId },
        });
        requireThat(branch.active, "Filial faol emas");
        const campaign = await selectCampaign(
          tx,
          c.id,
          input.purchaseSom,
          date,
          input.bonusEligible && !input.isDiscountedSet,
          input.branchId,
        );
        await tx.receipt.update({
          where: { id: receiptId },
          data: {
            status: "APPROVED",
            confirmedAmountSom: input.purchaseSom,
            confirmedPurchasedAt: date,
            branchId: input.branchId,
            tillId: input.tillId,
            externalSaleId: input.externalSaleId,
            manualVerificationNote: input.reason,
            isDiscountedSet: input.isDiscountedSet,
            bonusEligible: input.bonusEligible,
            reviewedAt: new Date(),
            reviewedByStaffId: staff.id,
            appliedCampaignKind: campaign?.campaign.kind,
            appliedCampaignPercent: campaign?.campaign.bonusPercent,
            offPeakMultiplierApplied:
              campaign?.campaign.kind === "OFF_PEAK_MULTIPLIER",
          },
        });
        await credit(
          tx,
          c.id,
          input.purchaseSom,
          "PURCHASE_BASE",
          `receipt:${receiptId}:base`,
          receiptId,
          "Tasdiqlangan xarid",
        );
        if (campaign) {
          await credit(
            tx,
            c.id,
            campaign.units,
            "PURCHASE_BONUS",
            `receipt:${receiptId}:bonus`,
            receiptId,
            campaign.campaign.nameUz,
          );
          if (campaign.referrer)
            await credit(
              tx,
              campaign.referrer,
              campaign.units,
              "REFERRAL_BONUS",
              `receipt:${receiptId}:referral`,
              receiptId,
              "Do‘stning birinchi xaridi",
            );
          await tx.campaignUsage.create({
            data: {
              campaignId: campaign.campaign.id,
              customerId: c.id,
              receiptId,
              units: campaign.units * (campaign.referrer ? 2 : 1),
              costSom: campaign.costSom,
              referrerCustomerId: campaign.referrer,
            },
          });
        }
        await audit(
          tx,
          staff.id,
          "APPROVE_RECEIPT",
          "Receipt",
          receiptId,
          receipt,
          input,
        );
        await notify(
          tx,
          c.id,
          `✅ Chekingiz tasdiqlandi. +${((input.purchaseSom + (campaign?.units ?? 0)) / cfg.unitsPerBall).toLocaleString("uz-UZ", { maximumFractionDigits: 5 })} BeshBall hisoblandi. Kichik xaridlar ham yig‘ilib boradi. Balansingizni «💰 BeshBallarim» tugmasidan ko‘ring.`,
          `receipt-approved:${receiptId}`,
          `✅ Чек подтверждён. Начислено +${((input.purchaseSom + (campaign?.units ?? 0)) / cfg.unitsPerBall).toLocaleString("ru-RU", { maximumFractionDigits: 5 })} BeshBall. Небольшие покупки тоже накапливаются. Баланс — кнопка «💰 Мои BeshBall».`,
        );
        return {
          ok: true,
          baseUnits: input.purchaseSom,
          bonusUnits: campaign?.units ?? 0,
        };
      },
    ),
  );
}
export async function reverseReceipt(
  receiptId: string,
  reason: string,
  staff: Staff,
) {
  return atomic(async (tx) => {
    const receipt = await tx.receipt.findUniqueOrThrow({
      where: { id: receiptId },
    });
    branchAccess(staff, receipt.branchId);
    if (receipt.status === "REVERSED") return { ok: true };
    requireThat(
      receipt.status === "APPROVED",
      "Faqat tasdiqlangan chek qaytariladi",
    );
    const entries = await tx.ledgerEntry.groupBy({
      by: ["customerId"],
      where: { relatedReceiptId: receiptId },
      _sum: { unitsDelta: true },
    });
    for (const e of entries) {
      const units = e._sum.unitsDelta ?? 0;
      if (units > 0) {
        const lots = await tx.pointLot.aggregate({
          where: { customerId: e.customerId, receiptId },
          _sum: { remaining: true },
        });
        const spent = Math.max(0, units - (lots._sum.remaining ?? 0));
        await tx.ledgerEntry.create({
          data: {
            customerId: e.customerId,
            type: "RECEIPT_REVERSAL",
            unitsDelta: -units,
            relatedReceiptId: receiptId,
            operationKey: `reverse:${receiptId}:${e.customerId}`,
            reasonNote: reason,
            createdByStaffId: staff.id,
          },
        });
        await tx.pointLot.updateMany({
          where: { customerId: e.customerId, receiptId },
          data: { remaining: 0 },
        });
        if (spent) await consume(tx, e.customerId, spent);
        await tx.giftReservation.updateMany({
          where: { customerId: e.customerId, status: "ACTIVE" },
          data: { status: "CANCELLED" },
        });
        const b = await balance(e.customerId, tx);
        if (b.totalUnits < 0 || spent > 0)
          await tx.customer.update({
            where: { id: e.customerId },
            data: { riskHold: true },
          });
        await notify(
          tx,
          e.customerId,
          `Chek qaytarildi: ${reason}. Hisob yangilandi.`,
          `reversal:${receiptId}:${e.customerId}`,
          `Чек возвращён: ${reason}. Баланс обновлён.`,
        );
      }
    }
    await tx.campaignUsage.updateMany({
      where: { receiptId },
      data: { reversed: true },
    });
    await tx.receipt.update({
      where: { id: receiptId },
      data: { status: "REVERSED" },
    });
    await audit(
      tx,
      staff.id,
      "REVERSE_RECEIPT",
      "Receipt",
      receiptId,
      receipt,
      { reason },
    );
    return { ok: true };
  });
}
