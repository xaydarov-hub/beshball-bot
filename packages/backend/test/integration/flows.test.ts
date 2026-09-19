import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac, randomInt } from "node:crypto";
import { prisma, atomic, defaultSettings } from "../../src/core.js";
import { buildServer } from "../../src/server.js";
import {
  balance,
  credit,
  approveReceipt,
  reverseReceipt,
} from "../../src/services/points.service.js";
import {
  reserveGift,
  inspectReservation,
  redeem,
  expireReservations,
} from "../../src/services/redemption.service.js";
import { deliverOne, canAdvertise } from "../../src/services/jobs.service.js";
import type { Staff } from "../../src/auth/access.js";
assert.equal(process.env.NODE_ENV, "test");
assert.ok(process.env.DATABASE_URL?.includes("/beshball_test"));
const app = buildServer();
// This suite uses an isolated test database; stale delivery fixtures from a
// previous run must not be selected by a later outbox test.
before(async () => {
  await prisma.outbox.deleteMany();
});
function initData(id: bigint) {
  const values = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: Number(id) }),
  };
  const secret = createHmac("sha256", "WebAppData")
    .update(process.env.TELEGRAM_BOT_TOKEN!)
    .digest();
  const hash = createHmac("sha256", secret)
    .update(
      Object.entries(values)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    )
    .digest("hex");
  return new URLSearchParams({ ...values, hash }).toString();
}
async function fixture(units = 735000) {
  const suffix = randomUUID();
  const branch = await prisma.branch.create({
    data: { name: `Test ${suffix}` },
  });
  const customer = await prisma.customer.create({
    data: {
      telegramUserId: BigInt(randomInt(1000000000000, 100000000000000)),
      fullName: "Test customer",
    },
  });
  const staff = await prisma.staffUser.create({
    data: {
      telegramUserId: customer.telegramUserId + 100000000000000n,
      fullName: "Test staff",
      role: "SUPER_ADMIN",
    },
    include: { branchAccess: true },
  });
  const gift = await prisma.gift.create({
    data: {
      nameUz: "Test gift",
      priceBalls: 7,
      menuPriceSom: 59000,
      branches: { create: { branchId: branch.id } },
    },
  });
  await atomic(async (tx) => {
    await tx.appSetting.upsert({
      where: { key: "business" },
      update: { value: defaultSettings },
      create: { key: "business", value: defaultSettings },
    });
    await credit(tx, customer.id, units, "MANUAL_ADJUSTMENT", suffix);
  });
  return { branch, customer, staff, gift };
}
async function receipt(
  f: Awaited<ReturnType<typeof fixture>>,
  status: "PENDING_REVIEW" | "RECEIVED" = "PENDING_REVIEW",
) {
  return prisma.receipt.create({
    data: {
      customerId: f.customer.id,
      branchId: f.branch.id,
      imageStorageKey: "test-not-an-image",
      imageHash: randomUUID(),
      status,
      firstReceivedAt: new Date(),
    },
  });
}
function approval(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    purchaseSom: 80000,
    purchasedAt: new Date().toISOString(),
    branchId: f.branch.id,
    tillId: "test-till",
    externalSaleId: randomUUID(),
    reason: "Manually verified test sale",
    saleVerified: true,
    paid: true,
    refunded: false,
    isDiscountedSet: false,
    bonusEligible: true,
    idempotencyKey: randomUUID(),
  };
}
test("6,7: unique image hash across customers and duplicate approval rejected", async () => {
  const a = await fixture(0),
    b = await fixture(0);
  const r = await receipt(a);
  await assert.rejects(
    prisma.receipt.create({
      data: {
        customerId: b.customer.id,
        imageHash: r.imageHash,
        imageStorageKey: "test",
      },
    }),
  );
  const input = approval(a);
  input.purchasedAt = new Date(
    r.firstReceivedAt.getTime() - 60000,
  ).toISOString();
  await approveReceipt(r.id, input, a.staff);
  await assert.rejects(
    approveReceipt(r.id, { ...input, idempotencyKey: randomUUID() }, a.staff),
  );
  assert.equal((await balance(a.customer.id)).totalUnits, 80000);
});
test("9: timely receipt remains valid after delayed review; 12: unpaid/foreign/refunded not approved", async () => {
  const f = await fixture(0);
  const r = await receipt(f);
  const first = new Date(Date.now() - 86400000);
  await prisma.receipt.update({
    where: { id: r.id },
    data: { firstReceivedAt: first },
  });
  const input = {
    ...approval(f),
    purchasedAt: new Date(first.getTime() - 7200000).toISOString(),
  };
  await assert.rejects(
    approveReceipt(r.id, { ...input, refunded: true }, f.staff),
  );
  await assert.rejects(
    approveReceipt(r.id, { ...input, saleVerified: false }, f.staff),
  );
  await approveReceipt(r.id, input, f.staff);
  assert.equal((await balance(f.customer.id)).totalUnits, 80000);
});
test("11: RECEIVED/READING cannot be approved before review", async () => {
  const f = await fixture(0);
  const r = await receipt(f, "RECEIVED");
  await assert.rejects(approveReceipt(r.id, approval(f), f.staff));
  assert.equal((await balance(f.customer.id)).totalUnits, 0);
});
test("14,15: cashier cannot approve; inactive and wrong-branch cashiers rejected", async () => {
  const f = await fixture();
  const cashier = await prisma.staffUser.create({
    data: {
      telegramUserId: BigInt(Math.floor(Math.random() * 1e12)),
      fullName: "Cashier test",
      role: "CASHIER",
      branchAccess: { create: { branchId: f.branch.id } },
    },
    include: { branchAccess: true },
  });
  const r = await receipt(f);
  const response = await app.inject({
    method: "POST",
    url: `/admin/receipts/${r.id}/approve`,
    headers: { "x-telegram-init-data": initData(cashier.telegramUserId) },
    payload: approval(f),
  });
  assert.equal(response.statusCode, 403);
  const reserved = await reserveGift(
    f.customer.id,
    f.gift.id,
    f.branch.id,
    randomUUID(),
  );
  const other = { ...cashier, branchAccess: [] } as Staff;
  await assert.rejects(
    inspectReservation({ qrToken: reserved.qrToken }, other),
  );
  await prisma.staffUser.update({
    where: { id: cashier.id },
    data: { active: false },
  });
  const inactive = await app.inject({
    method: "POST",
    url: "/cashier/inspect",
    headers: { "x-telegram-init-data": initData(cashier.telegramUserId) },
    payload: { qrToken: reserved.qrToken },
  });
  assert.equal(inactive.statusCode, 403);
});
test("16: expired reservation frees balance and cannot be redeemed", async () => {
  const f = await fixture();
  const r = await reserveGift(
    f.customer.id,
    f.gift.id,
    f.branch.id,
    randomUUID(),
  );
  assert.equal((await balance(f.customer.id)).reservedUnits, 700000);
  await prisma.giftReservation.update({
    where: { id: r.reservationId },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  assert.equal((await balance(f.customer.id)).availableUnits, 735000);
  await expireReservations();
  await assert.rejects(inspectReservation({ qrToken: r.qrToken }, f.staff));
});
test("17: real PostgreSQL parallel confirmation spends exactly once; retry is idempotent", async () => {
  const f = await fixture();
  const r = await reserveGift(
    f.customer.id,
    f.gift.id,
    f.branch.id,
    randomUUID(),
  );
  const inspected = await inspectReservation({ qrToken: r.qrToken }, f.staff);
  assert.ok("proof" in inspected);
  const k = randomUUID();
  const results = await Promise.allSettled([
    redeem(r.reservationId, inspected.proof, f.staff, k),
    redeem(r.reservationId, inspected.proof, f.staff, randomUUID()),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await balance(f.customer.id)).totalUnits, 35000);
  if (results[0].status === "fulfilled")
    await redeem(r.reservationId, inspected.proof, f.staff, k);
  assert.equal(
    await prisma.ledgerEntry.count({
      where: { relatedReservationId: r.reservationId },
    }),
    1,
  );
});
test("18: simultaneous reserves leave one active; replacement sees own cancellation", async () => {
  const f = await fixture();
  const results = await Promise.all([
    reserveGift(f.customer.id, f.gift.id, f.branch.id, randomUUID()),
    reserveGift(f.customer.id, f.gift.id, f.branch.id, randomUUID()),
  ]);
  assert.equal(results.length, 2);
  assert.equal(
    await prisma.giftReservation.count({
      where: { customerId: f.customer.id, status: "ACTIVE" },
    }),
    1,
  );
  assert.equal((await balance(f.customer.id)).availableUnits, 35000);
});
test("19: notification failure cannot repeat the financial operation", async () => {
  const f = await fixture();
  const r = await reserveGift(
    f.customer.id,
    f.gift.id,
    f.branch.id,
    randomUUID(),
  );
  const i = await inspectReservation({ qrToken: r.qrToken }, f.staff);
  assert.ok("proof" in i);
  await redeem(r.reservationId, i.proof, f.staff, randomUUID());
  await deliverOne(async () => {
    throw new Error("simulated transport failure");
  });
  assert.equal((await balance(f.customer.id)).totalUnits, 35000);
  assert.equal(
    await prisma.ledgerEntry.count({
      where: { relatedReservationId: r.reservationId },
    }),
    1,
  );
});
test("20: unavailable gift and daily stock limit", async () => {
  const f = await fixture();
  await prisma.gift.update({
    where: { id: f.gift.id },
    data: { temporarilyUnavailable: true },
  });
  await assert.rejects(
    reserveGift(f.customer.id, f.gift.id, f.branch.id, randomUUID()),
  );
  await prisma.gift.update({
    where: { id: f.gift.id },
    data: { temporarilyUnavailable: false, dailyLimit: 0 },
  });
  await assert.rejects(
    reserveGift(f.customer.id, f.gift.id, f.branch.id, randomUUID()),
  );
});
test("21,24: one best bonus, reversal cancels base+bonus and is idempotent", async () => {
  const f = await fixture(0);
  await prisma.campaign.updateMany({ data: { active: false } });
  await prisma.campaign.create({
    data: {
      kind: "AMOUNT_TIER",
      nameUz: "Test 10%",
      bonusPercent: 10,
      minAmountSom: 80000,
      active: true,
    },
  });
  await prisma.campaign.create({
    data: {
      kind: "AMOUNT_TIER",
      nameUz: "Test 5%",
      bonusPercent: 5,
      minAmountSom: 50000,
      active: true,
    },
  });
  const r = await receipt(f);
  const a = approval(f);
  a.purchasedAt = new Date(r.firstReceivedAt.getTime() - 1000).toISOString();
  await approveReceipt(r.id, a, f.staff);
  assert.equal((await balance(f.customer.id)).totalUnits, 90000);
  await reverseReceipt(r.id, "Test refund", f.staff);
  await reverseReceipt(r.id, "Test refund again", f.staff);
  assert.equal((await balance(f.customer.id)).totalUnits, 0);
  assert.equal(
    await prisma.ledgerEntry.count({
      where: { relatedReceiptId: r.id, type: "RECEIPT_REVERSAL" },
    }),
    1,
  );
  await prisma.campaign.updateMany({ data: { active: false } });
});
test("22: advertising consent, weekly cap and quiet hours", () => {
  const c = {
    marketingConsentAt: new Date(),
    marketingUnsubscribed: false,
    blocked: false,
  };
  assert.equal(canAdvertise(c, 1, 2, 12), true);
  assert.equal(canAdvertise(c, 2, 2, 12), false);
  assert.equal(
    canAdvertise({ ...c, marketingConsentAt: null }, 0, 2, 12),
    false,
  );
  assert.equal(canAdvertise(c, 0, 2, 23), false);
  assert.equal(canAdvertise({ ...c, blocked: true }, 0, 2, 12), false);
});
test("backup code failures persist across rollbacks and cap attempts", async () => {
  const f = await fixture();
  const r = await reserveGift(
    f.customer.id,
    f.gift.id,
    f.branch.id,
    randomUUID(),
  );
  for (let n = 0; n < 5; n++)
    await assert.rejects(
      inspectReservation(
        { reservationId: r.reservationId, backupCode: "000000" },
        f.staff,
      ),
    );
  const stored = await prisma.giftReservation.findUniqueOrThrow({
    where: { id: r.reservationId },
  });
  assert.equal(stored.backupCodeAttempts, 5);
  await assert.rejects(
    inspectReservation(
      { reservationId: r.reservationId, backupCode: r.backupCode },
      f.staff,
    ),
  );
});
test("customer API requires bot secret and verified customer identity", async () => {
  const f = await fixture();
  const open = await app.inject({
    method: "GET",
    url: `/customers/${f.customer.id}/balance`,
  });
  assert.equal(open.statusCode, 401);
  const wrong = await app.inject({
    method: "GET",
    url: `/customers/${f.customer.id}/balance`,
    headers: {
      "x-bot-secret": process.env.BOT_API_SECRET!,
      "x-telegram-user-id": "1",
    },
  });
  assert.equal(wrong.statusCode, 403);
});
test("Club card uses editable catalog, exact progress, referral identity and tolerates debt", async () => {
  const f = await fixture(265000);
  const headers = {
    "x-bot-secret": process.env.BOT_API_SECRET!,
    "x-telegram-user-id": String(f.customer.telegramUserId),
  };
  const card = await app.inject({
    url: `/customers/${f.customer.id}/club-card`,
    headers,
  });
  assert.equal(card.statusCode, 200, card.body);
  const goal = card.json().goals.find((g: any) => g.id === f.gift.id);
  assert.equal(goal.progress.requiredUnits, 435000);
  assert.equal(goal.menuPriceSom, 59000);
  assert.equal(goal.targetSom, 700000);
  assert.equal(card.json().referralPayload, `ref_${f.customer.telegramUserId}`);
  await prisma.gift.update({
    where: { id: f.gift.id },
    data: { priceBalls: 6 },
  });
  const updated = await app.inject({
    url: `/customers/${f.customer.id}/club-card`,
    headers,
  });
  assert.equal(
    updated.json().goals.find((g: any) => g.id === f.gift.id).progress
      .requiredUnits,
    335000,
  );
  await prisma.ledgerEntry.create({
    data: {
      customerId: f.customer.id,
      type: "MANUAL_ADJUSTMENT",
      unitsDelta: -300000,
      reasonNote: "Test debt",
    },
  });
  assert.equal(
    (
      await app.inject({
        url: `/customers/${f.customer.id}/club-card`,
        headers,
      })
    ).statusCode,
    200,
  );
});
test("Staff authentication succeeds for a real signed identity, then rejects a deactivated staff member", async () => {
  const f = await fixture();
  const headers = { "x-telegram-init-data": initData(f.staff.telegramUserId) };
  const me = await app.inject({ url: "/admin/me", headers });
  assert.equal(me.statusCode, 200, me.body);
  assert.equal(me.json().id, f.staff.id);
  await prisma.staffUser.update({
    where: { id: f.staff.id },
    data: { active: false },
  });
  assert.equal(
    (await app.inject({ url: "/admin/me", headers })).statusCode,
    403,
  );
});
test("Webhook deduplicates, leases once across consumers, rejects stale completion and retries failure", async () => {
  // Test-only queue reset; never touches a live database.
  await prisma.telegramUpdate.deleteMany();
  const headers = { "x-bot-secret": process.env.BOT_API_SECRET! };
  const webhook = {
    "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET!,
  };
  const payload = { update_id: 1234500, message: { text: "test" } };
  assert.equal(
    (await app.inject({ method: "POST", url: "/telegram/webhook", payload }))
      .statusCode,
    401,
  );
  for (let n = 0; n < 2; n++)
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/telegram/webhook",
          headers: webhook,
          payload,
        })
      ).statusCode,
      200,
    );
  assert.equal(await prisma.telegramUpdate.count(), 1);
  const claims = await Promise.all([
    app.inject({ url: "/bot/updates/next", headers }),
    app.inject({ url: "/bot/updates/next", headers }),
  ]);
  const claimed = claims.map((r) => r.json()).filter(Boolean);
  assert.equal(claimed.length, 1);
  const lease = claimed[0];
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/bot/updates/${lease.id}/done`,
        headers,
        payload: { leaseToken: randomUUID() },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/bot/updates/${lease.id}/failed`,
        headers,
        payload: { leaseToken: lease.leaseToken },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: "/bot/updates/next", headers })).json(),
    null,
  );
  await prisma.telegramUpdate.update({
    where: { id: lease.id },
    data: { availableAt: new Date(0) },
  });
  const retry = (
    await app.inject({ url: "/bot/updates/next", headers })
  ).json();
  assert.notEqual(retry.leaseToken, lease.leaseToken);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/bot/updates/${lease.id}/done`,
        headers,
        payload: { leaseToken: retry.leaseToken },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: "/bot/updates/next", headers })).json(),
    null,
  );
});
test("Telegram 403 cancels pending messages and prevents retries until new user activity", async () => {
  const f = await fixture();
  await prisma.outbox.updateMany({
    where: { status: { in: ["PENDING", "SENDING"] } },
    data: { status: "CANCELLED" },
  });
  for (let i = 0; i < 2; i++)
    await prisma.outbox.create({
      data: {
        key: randomUUID(),
        customerId: f.customer.id,
        telegramId: String(f.customer.telegramUserId),
        text: "Test only",
      },
    });
  let calls = 0;
  await deliverOne(async () => {
    calls++;
    throw Object.assign(new Error("Blocked"), { code: 403 });
  });
  await deliverOne(async () => {
    calls++;
  });
  assert.equal(calls, 1);
  assert.equal(
    (await prisma.customer.findUniqueOrThrow({ where: { id: f.customer.id } }))
      .telegramBlocked,
    true,
  );
  const resumed = await app.inject({
    url: `/bot/sessions/${f.customer.telegramUserId}`,
    headers: {
      "x-bot-secret": process.env.BOT_API_SECRET!,
      "x-telegram-user-id": String(f.customer.telegramUserId),
    },
  });
  assert.equal(resumed.statusCode, 200, resumed.body);
  assert.equal(
    (await prisma.customer.findUniqueOrThrow({ where: { id: f.customer.id } }))
      .telegramBlocked,
    false,
  );
});
test("Nullable birthday preference clears stored birthday", async () => {
  const f = await fixture();
  await prisma.customer.update({
    where: { id: f.customer.id },
    data: { birthDate: new Date("2000-01-02T00:00:00Z") },
  });
  const r = await app.inject({
    method: "PATCH",
    url: `/bot/customers/${f.customer.id}/preferences`,
    headers: {
      "x-bot-secret": process.env.BOT_API_SECRET!,
      "x-telegram-user-id": String(f.customer.telegramUserId),
    },
    payload: { birthDayMonth: null },
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(
    (await prisma.customer.findUniqueOrThrow({ where: { id: f.customer.id } }))
      .birthDate,
    null,
  );
});

test("Debt does not offset another customer's outstanding reward liability", async () => {
  const f = await fixture(0);
  const headers = { "x-telegram-init-data": initData(f.staff.telegramUserId) };
  const before = (
    await app.inject({ url: "/admin/reports/summary", headers })
  ).json();
  await prisma.ledgerEntry.create({
    data: {
      customerId: f.customer.id,
      type: "MANUAL_ADJUSTMENT",
      unitsDelta: -100000,
      reasonNote: "Debt regression",
    },
  });
  const response = await app.inject({ url: "/admin/reports/summary", headers });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(
    response.json().estimatedLiabilitySom,
    before.estimatedLiabilitySom,
  );
  assert.equal(response.json().debtUnits, before.debtUnits + 100000);
});

test("Transactional delivery leaves marketing messages queued", async (t) => {
  const f = await fixture();
  t.after(async () => {
    await prisma.outbox.deleteMany({ where: { customerId: f.customer.id } });
  });
  await prisma.outbox.updateMany({
    where: { status: { in: ["PENDING", "SENDING"] } },
    data: { status: "CANCELLED" },
  });
  const advertisement = await prisma.outbox.create({
    data: {
      key: randomUUID(),
      customerId: f.customer.id,
      telegramId: String(f.customer.telegramUserId),
      text: "Advertisement must remain queued",
      broadcastId: "marketing-test",
    },
  });
  const notification = await prisma.outbox.create({
    data: {
      key: randomUUID(),
      customerId: f.customer.id,
      telegramId: String(f.customer.telegramUserId),
      text: "Receipt approved test",
    },
  });
  const sent: string[] = [];
  assert.equal(
    await deliverOne(
      async (_id, text) => {
        sent.push(text);
      },
      { transactionalOnly: true },
    ),
    true,
  );
  assert.deepEqual(sent, [notification.text]);
  assert.equal(
    (await prisma.outbox.findUniqueOrThrow({ where: { id: advertisement.id } }))
      .status,
    "PENDING",
  );
  assert.equal(
    await deliverOne(
      async () => {
        throw new Error("Marketing must not send");
      },
      { transactionalOnly: true },
    ),
    false,
  );
});

test("Expired webhook leases recover once and reject the previous lease", async () => {
  await prisma.telegramUpdate.deleteMany();
  const oldLease = randomUUID();
  await prisma.telegramUpdate.create({
    data: {
      id: 2100000001,
      payload: { update_id: 2100000001 },
      status: "PROCESSING",
      leaseToken: oldLease,
      lockedAt: new Date(Date.now() - 360000),
    },
  });
  const headers = { "x-bot-secret": process.env.BOT_API_SECRET! };
  const claims = await Promise.all([
    app.inject({ url: "/bot/updates/next", headers }),
    app.inject({ url: "/bot/updates/next", headers }),
  ]);
  const leases = claims.map((r) => r.json()).filter(Boolean);
  assert.equal(leases.length, 1);
  assert.notEqual(leases[0].leaseToken, oldLease);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/bot/updates/2100000001/done",
        headers,
        payload: { leaseToken: oldLease },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/bot/updates/2100000001/done",
        headers,
        payload: { leaseToken: leases[0].leaseToken },
      })
    ).statusCode,
    200,
  );
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});
