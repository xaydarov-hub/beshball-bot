import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 5-banddagi boshlang'ich sovg'a katalogi (tahrirlanadigan, faqat namuna). */
const GIFTS = [
  { nameUz: "Fri mayonez bilan", menuPriceSom: 10_000, priceBalls: 1 },
  { nameUz: "2 ta sous", menuPriceSom: 8_000, priceBalls: 1 },
  { nameUz: "Oddiy hot-dog", menuPriceSom: 17_000, priceBalls: 2 },
  { nameUz: "Tovuqli burger", menuPriceSom: 20_000, priceBalls: 3 },
  { nameUz: "Tovuqli lavash", menuPriceSom: 32_000, priceBalls: 4 },
  { nameUz: "Oddiy lavash", menuPriceSom: 36_000, priceBalls: 5 },
  { nameUz: "Besh Bola burger", menuPriceSom: 37_000, priceBalls: 5 },
  { nameUz: "Tovuqli lavash set", menuPriceSom: 43_000, priceBalls: 6 },
  { nameUz: "25 sm pitsa", menuPriceSom: 59_000, priceBalls: 7 },
];

/** 11-banddagi barcha aksiyalar - boshlang'ich holatda NOFAOL (active: false). */
const CAMPAIGNS = [
  { kind: "SECOND_PURCHASE_7D", nameUz: "7 kunlik ikkinchi xarid", bonusPercent: 15, minAmountSom: 30_000 },
  { kind: "REFERRAL_FIRST_PURCHASE", nameUz: "Do'st taklifi", bonusPercent: 15, minAmountSom: 40_000 },
  { kind: "AMOUNT_TIER", nameUz: "50 000 dan boshlab", bonusPercent: 5, minAmountSom: 50_000 },
  { kind: "AMOUNT_TIER", nameUz: "80 000 dan boshlab", bonusPercent: 10, minAmountSom: 80_000 },
  { kind: "AMOUNT_TIER", nameUz: "120 000 dan boshlab", bonusPercent: 20, minAmountSom: 120_000 },
  { kind: "WINBACK_21D", nameUz: "21 kun qaytish", bonusPercent: 25, minAmountSom: 40_000 },
  { kind: "BIRTHDAY_WINDOW", nameUz: "Tug'ilgan kun atrofi", bonusPercent: 25 },
  { kind: "OFF_PEAK_MULTIPLIER", nameUz: "Sust vaqt x1.5", multiplierNum: 3, multiplierDen: 2 },
];

async function main() {
  const branch = await prisma.branch.upsert({
    where: { id: "seed-main-branch" },
    update: {},
    create: { id: "seed-main-branch", name: "Besh Bola Lavash - Bosh filial" },
  });

  for (const gift of GIFTS) {
    const existing = await prisma.gift.findFirst({ where: { nameUz: gift.nameUz } });
    const record = existing
      ? await prisma.gift.update({ where: { id: existing.id }, data: gift })
      : await prisma.gift.create({ data: gift });
    await prisma.giftBranch.upsert({
      where: { giftId_branchId: { giftId: record.id, branchId: branch.id } },
      update: {},
      create: { giftId: record.id, branchId: branch.id },
    });
  }

  for (const campaign of CAMPAIGNS) {
    const existing = await prisma.campaign.findFirst({ where: { nameUz: campaign.nameUz } });
    if (existing) {
      await prisma.campaign.update({ where: { id: existing.id }, data: { ...campaign, active: false } });
    } else {
      await prisma.campaign.create({ data: { ...campaign, active: false } });
    }
  }

  await prisma.posAdapterConfig.upsert({
    where: { id: "zimzim-singleton" },
    update: {},
    create: { id: "zimzim-singleton", providerName: "zimzim", status: "NOT_CONFIGURED" },
  });

  // Bosh admin: .env dagi SUPER_ADMIN_TELEGRAM_IDS (vergul bilan ajratilgan) orqali.
  const superAdminIds = (process.env.SUPER_ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const idStr of superAdminIds) {
    await prisma.staffUser.upsert({
      where: { telegramUserId: BigInt(idStr) },
      update: { role: "SUPER_ADMIN", active: true },
      create: {
        telegramUserId: BigInt(idStr),
        fullName: "Bosh admin",
        role: "SUPER_ADMIN",
      },
    });
  }

  console.log(`Seed tugadi. ${GIFTS.length} sovg'a, ${CAMPAIGNS.length} aksiya, ${superAdminIds.length} bosh admin.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
