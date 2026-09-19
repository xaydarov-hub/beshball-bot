import "../packages/backend/src/config.js";
import {
  prisma,
  atomic,
  defaultSettings,
} from "../packages/backend/src/core.js";
const gifts = [
  ["Fri mayonez bilan", 10000, 1],
  ["2 ta sous", 8000, 1],
  ["Oddiy hot-dog", 17000, 2],
  ["Tovuqli burger", 20000, 3],
  ["Tovuqli lavash", 32000, 4],
  ["Oddiy lavash", 36000, 5],
  ["Besh Bola burger", 37000, 5],
  ["Tovuqli lavash set", 43000, 6],
  ["25 sm pitsa", 59000, 7],
] as const;
const campaigns = [
  {
    kind: "SECOND_PURCHASE_7D",
    nameUz: "7 kun ichida ikkinchi xarid",
    bonusPercent: 15,
    minAmountSom: 30000,
  },
  {
    kind: "REFERRAL_FIRST_PURCHASE",
    nameUz: "Do‘st taklifi",
    bonusPercent: 15,
    minAmountSom: 40000,
  },
  {
    kind: "AMOUNT_TIER",
    nameUz: "50 000 so‘mdan",
    bonusPercent: 5,
    minAmountSom: 50000,
  },
  {
    kind: "AMOUNT_TIER",
    nameUz: "80 000 so‘mdan",
    bonusPercent: 10,
    minAmountSom: 80000,
  },
  {
    kind: "AMOUNT_TIER",
    nameUz: "120 000 so‘mdan",
    bonusPercent: 20,
    minAmountSom: 120000,
  },
  {
    kind: "WINBACK_21D",
    nameUz: "21 kundan keyin qaytish",
    bonusPercent: 25,
    minAmountSom: 40000,
  },
  {
    kind: "BIRTHDAY_WINDOW",
    nameUz: "Tug‘ilgan kun ±3 kun",
    bonusPercent: 25,
    minAmountSom: 30000,
  },
  {
    kind: "OFF_PEAK_MULTIPLIER",
    nameUz: "Sust vaqt ×1.5",
    multiplierNum: 3,
    multiplierDen: 2,
    config: { hours: [14, 15, 16] },
  },
];
await atomic(async (tx) => {
  const branch = await tx.branch.upsert({
    where: { id: "seed-main-branch" },
    update: {},
    create: { id: "seed-main-branch", name: "Besh Bola Lavash — Bosh filial" },
  });
  await tx.gift.createMany({
    data: gifts.map(([nameUz, menuPriceSom, priceBalls], i) => ({
      id: `seed-gift-${i + 1}`,
      nameUz,
      menuPriceSom,
      priceBalls,
    })),
    skipDuplicates: true,
  });
  await tx.giftBranch.createMany({
    data: gifts.map((_, i) => ({
      giftId: `seed-gift-${i + 1}`,
      branchId: branch.id,
    })),
    skipDuplicates: true,
  });
  await tx.campaign.createMany({
    data: campaigns.map((c, i) => ({
      ...c,
      id: `seed-campaign-${i + 1}`,
      active: false,
      usageLimitPerCustomer:
        c.kind === "AMOUNT_TIER" || c.kind === "OFF_PEAK_MULTIPLIER" ? null : 1,
    })),
    skipDuplicates: true,
  });
  await tx.appSetting.upsert({
    where: { key: "business" },
    update: {},
    create: { key: "business", value: defaultSettings },
  });
  await tx.posAdapterConfig.upsert({
    where: { id: "zimzim-singleton" },
    update: {},
    create: {
      id: "zimzim-singleton",
      providerName: "zimzim",
      status: "NOT_CONFIGURED",
    },
  });
  for (const id of (process.env.SUPER_ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (!/^\d+$/.test(id)) throw new Error("Admin ID faqat raqam bo‘lsin");
    await tx.staffUser.upsert({
      where: { telegramUserId: BigInt(id) },
      update: {},
      create: {
        telegramUserId: BigInt(id),
        fullName: "Bosh admin",
        role: "SUPER_ADMIN",
      },
    });
  }
});
console.log(
  "Seed tugadi. Mavjud narxlar, aksiyalar va rollar o‘zgartirilmadi.",
);
await prisma.$disconnect();
