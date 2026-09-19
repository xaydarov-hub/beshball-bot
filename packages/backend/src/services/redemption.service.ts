import { randomBytes, randomInt } from "node:crypto";
import {
  atomic,
  once,
  requireThat,
  hash,
  settings,
  dayStart,
  audit,
  notify,
  type Tx,
} from "../core.js";
import { balance, consume } from "./points.service.js";
import { branchAccess, type Staff } from "../auth/access.js";
async function availability(
  tx: Tx,
  giftId: string,
  branchId: string,
  exclude?: string,
) {
  const gift = await tx.gift.findUniqueOrThrow({
    where: { id: giftId },
    include: { branches: true },
  });
  const branch = await tx.branch.findUnique({ where: { id: branchId } });
  requireThat(
    branch?.active &&
      gift.active &&
      !gift.temporarilyUnavailable &&
      gift.branches.some((b) => b.branchId === branchId && b.active),
    "Sovg‘a bu filialda mavjud emas",
  );
  if (gift.dailyLimit !== null) {
    const n = await tx.giftReservation.count({
      where: {
        giftId,
        id: exclude ? { not: exclude } : undefined,
        OR: [
          { status: "REDEEMED", redeemedAt: { gte: dayStart() } },
          { status: "ACTIVE", expiresAt: { gt: new Date() } },
        ],
      },
    });
    requireThat(n < gift.dailyLimit, "Sovg‘aning kunlik limiti tugagan");
  }
  return gift;
}
export async function reserveGift(
  customerId: string,
  giftId: string,
  branchId: string,
  idempotencyKey: string,
) {
  return atomic((tx) =>
    once(
      tx,
      `reserve:${customerId}:${idempotencyKey}`,
      { giftId, branchId },
      async () => {
        const c = await tx.customer.findUniqueOrThrow({
          where: { id: customerId },
        });
        requireThat(
          !c.blocked && !c.riskHold,
          "Hisob tekshiruvda yoki bloklangan",
        );
        await tx.giftReservation.updateMany({
          where: { customerId, status: "ACTIVE" },
          data: { status: "CANCELLED" },
        });
        const gift = await availability(tx, giftId, branchId);
        const cfg = await settings(tx);
        const b = await balance(customerId, tx);
        requireThat(
          b.availableUnits >= gift.priceBalls * cfg.unitsPerBall,
          "Balans yetarli emas",
        );
        const qrToken = randomBytes(32).toString("hex");
        const backupCode = String(randomInt(100000, 1000000));
        const r = await tx.giftReservation.create({
          data: {
            customerId,
            giftId,
            branchId,
            priceBallsAtReserve: gift.priceBalls,
            menuPriceSomAtReserve: gift.menuPriceSom,
            realCostSomAtReserve: gift.realCostSom,
            qrTokenHash: hash(qrToken),
            backupCode: hash(backupCode),
            expiresAt: new Date(Date.now() + cfg.qrSeconds * 1000),
          },
        });
        return {
          reservationId: r.id,
          qrToken,
          backupCode,
          expiresAt: r.expiresAt,
          priceBalls: r.priceBallsAtReserve,
        };
      },
    ),
  );
}
export async function inspectReservation(
  input: { qrToken?: string; reservationId?: string; backupCode?: string },
  staff: Staff,
) {
  // Failed attempts must COMMIT: return an error value inside tx, throw outside.
  const result = await atomic(async (tx) => {
    const r = input.qrToken
      ? await tx.giftReservation.findUnique({
          where: { qrTokenHash: hash(input.qrToken) },
        })
      : await tx.giftReservation.findUnique({
          where: { id: input.reservationId ?? "" },
        });
    requireThat(r, "Rezerv topilmadi", 404);
    branchAccess(staff, r.branchId);
    requireThat(
      r.status === "ACTIVE" && r.expiresAt > new Date(),
      "Rezerv faol emas",
      409,
    );
    if (!input.qrToken) {
      requireThat(r.backupCodeAttempts < 5, "Urinishlar limiti tugagan", 429);
      if (r.backupCode !== hash(input.backupCode ?? "")) {
        await tx.giftReservation.update({
          where: { id: r.id },
          data: { backupCodeAttempts: { increment: 1 } },
        });
        return { error: "Zaxira kod noto‘g‘ri" };
      }
    }
    const c = await tx.customer.findUniqueOrThrow({
      where: { id: r.customerId },
    });
    const gift = await tx.gift.findUniqueOrThrow({ where: { id: r.giftId } });
    // Proof scoped to staff + reservation; cannot redeem by guessing a reservation ID.
    const proof = randomBytes(32).toString("hex");
    await tx.idempotencyKey.create({
      data: { key: `proof:${hash(proof)}`, requestHash: `${staff.id}:${r.id}` },
    });
    return {
      reservationId: r.id,
      proof,
      customerName: c.fullName,
      phone: c.phoneE164
        ? `${c.phoneE164.slice(0, 4)}••••${c.phoneE164.slice(-4)}`
        : "—",
      giftName: gift.nameUz,
      priceBalls: r.priceBallsAtReserve,
      expiresAt: r.expiresAt,
      balance: await balance(c.id, tx),
    };
  });
  requireThat(
    !("error" in result),
    ("error" in result ? result.error : "") ?? "Kod xato",
  );
  return result;
}
export async function redeem(
  reservationId: string,
  proof: string,
  staff: Staff,
  idempotencyKey: string,
) {
  return atomic((tx) =>
    once(
      tx,
      `redeem:${staff.id}:${idempotencyKey}`,
      { reservationId, proof },
      async () => {
        const p = await tx.idempotencyKey.findUnique({
          where: { key: `proof:${hash(proof)}` },
        });
        requireThat(
          p?.requestHash === `${staff.id}:${reservationId}` &&
            p.createdAt.getTime() > Date.now() - 180000,
          "Avval QR yoki zaxira kodni tekshiring",
          403,
        );
        const r = await tx.giftReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
        branchAccess(staff, r.branchId);
        requireThat(
          r.status === "ACTIVE" && r.expiresAt > new Date(),
          "Rezerv ishlatilgan yoki muddati tugagan",
          409,
        );
        const c = await tx.customer.findUniqueOrThrow({
          where: { id: r.customerId },
        });
        requireThat(!c.blocked && !c.riskHold, "Mijoz hisobi tekshiruvda");
        await availability(tx, r.giftId, r.branchId!, r.id);
        const cfg = await settings(tx);
        const cost = r.priceBallsAtReserve * cfg.unitsPerBall;
        const b = await balance(c.id, tx);
        requireThat(
          b.totalUnits >= b.reservedUnits && b.totalUnits >= cost,
          "Balans yetarli emas",
        );
        await tx.giftReservation.update({
          where: { id: r.id },
          data: {
            status: "REDEEMED",
            redeemedAt: new Date(),
            redeemedByCashierId: staff.id,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            customerId: c.id,
            type: "REDEMPTION",
            unitsDelta: -cost,
            operationKey: `redeem:${r.id}`,
            relatedReservationId: r.id,
            reasonNote: "Sovg‘a berildi",
          },
        });
        await consume(tx, c.id, cost);
        await audit(tx, staff.id, "REDEEM", "GiftReservation", r.id, r, {
          status: "REDEEMED",
        });
        await notify(
          tx,
          c.id,
          `Sovg‘angiz berildi. ${r.priceBallsAtReserve} BeshBall sarflandi.`,
          `redeemed:${r.id}`,
          `Подарок выдан. Списано ${r.priceBallsAtReserve} BeshBall.`,
        );
        return { ok: true, reservationId: r.id };
      },
    ),
  );
}
export async function expireReservations() {
  return atomic((tx) =>
    tx.giftReservation.updateMany({
      where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    }),
  );
}
