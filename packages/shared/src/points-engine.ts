/**
 * BeshBall ochko (ball) hisoblash yadrosi.
 *
 * QOIDA: Hech qachon float/decimal bilan ball hisoblanmaydi.
 * Barcha summalar butun so'm (UZS da tiyin yo'q), barcha ichki
 * hisob-kitoblar butun "birlik" (unit) larda, faqat Number.isInteger
 * qiymatlar bilan ishlaydi. Bo'lish kerak bo'lgan joyda faqat
 * Math.floor bilan pastga yaxlitlanadi (spetsifikatsiya talabi).
 *
 * 1 BeshBall = 100_000 ichki birlik.
 * 1 so'm tegishli xarid = 1 ichki birlik (bazaviy progress).
 */

export const UNITS_PER_BALL = 100_000;

export interface RationalMultiplier {
  /** masalan x1.5 uchun { num: 3, den: 2 } */
  num: number;
  den: number;
}

function assertNonNegativeInteger(n: number, label: string): void {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(
      `${label} butun va manfiy bo'lmagan son bo'lishi kerak, olindi: ${n}`,
    );
  }
}

/**
 * Xarid summasidan (so'm) bazaviy birlik hisoblaydi. 1:1 mapping.
 */
export function unitsFromPurchaseSom(purchaseSom: number): number {
  assertNonNegativeInteger(purchaseSom, "purchaseSom");
  return purchaseSom;
}

/**
 * Ratsional (kasrsiz) ko'paytiruvchi qo'llaydi, masalan sust vaqt x1.5.
 * Faqat butun sonlar bilan ko'paytirib, so'ng pastga yaxlitlanadi -
 * floating point ishlatilmaydi.
 */
export function applyRationalMultiplier(
  units: number,
  m: RationalMultiplier,
): number {
  assertNonNegativeInteger(units, "units");
  if (
    !Number.isInteger(m.num) ||
    !Number.isInteger(m.den) ||
    m.den <= 0 ||
    m.num < 0
  ) {
    throw new Error("Multiplier num/den butun, den > 0 bo'lishi kerak");
  }
  const product = units * m.num;
  if (!Number.isSafeInteger(product))
    throw new Error("Birlik safe integer chegarasidan oshdi");
  return Math.floor(product / m.den);
}

/**
 * Foiz-bonus HAR DOIM bitta BeshBallning (100_000 birlik) foizi sifatida
 * hisoblanadi, xarid summasining foizi sifatida EMAS.
 * Masalan +15% => floor(100000 * 15 / 100) = 15000 birlik.
 */
export function bonusUnitsForPercent(percent: number): number {
  if (!Number.isInteger(percent) || percent < 0 || percent > 1000) {
    throw new Error(
      `percent 0..1000 oralig'ida butun son bo'lishi kerak, olindi: ${percent}`,
    );
  }
  return Math.floor((UNITS_PER_BALL * percent) / 100);
}

export interface BallBreakdown {
  /** to'liq yig'ilgan BeshBall soni */
  balls: number;
  /** keyingi ballgacha qolgan progress, birlikda (0..UNITS_PER_BALL-1) */
  progressUnits: number;
  /** progress foizda, 0..99 (butun, pastga yaxlitlangan) */
  progressPercent: number;
}

/**
 * Umumiy birlik sonini to'liq ball + progressga ajratadi.
 * Test #1: 110000 -> 1 ball, 10% progress.
 * Test #2: 700000 -> 7 ball, 0% progress.
 */
export function ballsFromUnits(totalUnits: number): BallBreakdown {
  assertNonNegativeInteger(totalUnits, "totalUnits");
  const balls = Math.floor(totalUnits / UNITS_PER_BALL);
  const progressUnits = totalUnits - balls * UNITS_PER_BALL;
  const progressPercent = Math.floor((progressUnits * 100) / UNITS_PER_BALL);
  return { balls, progressUnits, progressPercent };
}

/**
 * Sovg'a uchun N ball sarflashda qolgan birlikni hisoblaydi.
 * Test #3: 735000 birlikdan 7 ball sarflansa -> 35000 qoladi.
 */
export function spendBalls(totalUnits: number, ballsToSpend: number): number {
  assertNonNegativeInteger(totalUnits, "totalUnits");
  assertNonNegativeInteger(ballsToSpend, "ballsToSpend");
  const cost = ballsToSpend * UNITS_PER_BALL;
  if (cost > totalUnits) {
    throw new Error("Balansda yetarli ball yo'q");
  }
  return totalUnits - cost;
}

export interface RewardGoalProgress {
  earnedBalls: number;
  remainingBalls: number;
  currentProgressPercent: number;
  requiredUnits: number;
  canRedeem: boolean;
}

export interface ClubRewardGoal {
  id: string;
  nameUz: string;
  nameRu: string;
  targetBalls: number;
  rewardPriceSom?: number;
}

/**
 * Mijozning ma'lum sovg'a maqsadi bo'yicha progressini hisoblaydi.
 * Masalan: 700000 birlik = 7 ball, shu maqsad tayyor.
 */
export function rewardGoalProgress(
  totalUnits: number,
  targetBalls: number,
): RewardGoalProgress {
  assertNonNegativeInteger(totalUnits, "totalUnits");
  assertNonNegativeInteger(targetBalls, "targetBalls");
  if (targetBalls <= 0) {
    return {
      earnedBalls: 0,
      remainingBalls: 0,
      currentProgressPercent: 100,
      requiredUnits: 0,
      canRedeem: true,
    };
  }

  const earnedBalls = Math.min(
    Math.floor(totalUnits / UNITS_PER_BALL),
    targetBalls,
  );
  const remainingBalls = Math.max(0, targetBalls - earnedBalls);
  const targetUnits = targetBalls * UNITS_PER_BALL;
  assertNonNegativeInteger(targetUnits, "targetUnits");
  const currentProgressPercent = Math.floor(
    (Math.min(totalUnits, targetUnits) / targetUnits) * 100,
  );
  const requiredUnits = Math.max(0, targetUnits - totalUnits);

  return {
    earnedBalls,
    remainingBalls,
    currentProgressPercent,
    requiredUnits,
    canRedeem: earnedBalls >= targetBalls,
  };
}

export function buildClubGoals(): ClubRewardGoal[] {
  return [
    {
      id: "mini",
      nameUz: "Kichik sovg‘a",
      nameRu: "Маленький подарок",
      targetBalls: 1,
      rewardPriceSom: 10_000,
    },
    {
      id: "combo",
      nameUz: "Tovuq lavash",
      nameRu: "Куриный лаваш",
      targetBalls: 4,
      rewardPriceSom: 32_000,
    },
    {
      id: "pizza",
      nameUz: "25 sm pizza",
      nameRu: "Пицца 25 см",
      targetBalls: 7,
      rewardPriceSom: 59_000,
    },
  ];
}

/**
 * Bitta chek uchun to'liq hisob-kitob: bazaviy birlik + (ixtiyoriy)
 * multiplikator + (ixtiyoriy, faqat BITTA) tier-bonus foizi.
 *
 * Bir chekda faqat bitta aksiya: multiplikator yoki foiz bonusidan
 * mijozga ko'proq birlik beradigan bittasi qo'llanadi.
 */
export interface ReceiptComputationInput {
  purchaseSom: number;
  offPeakMultiplier?: RationalMultiplier; // masalan {num:3,den:2} = x1.5
  tierBonusPercent?: number; // faqat bitta eng yuqori bosqich, tashqarida tanlanadi
}

export interface ReceiptComputationResult {
  baseUnits: number;
  multipliedUnits: number;
  bonusUnits: number;
  totalUnits: number;
}

export function computeReceiptUnits(
  input: ReceiptComputationInput,
): ReceiptComputationResult {
  const baseUnits = unitsFromPurchaseSom(input.purchaseSom);
  const candidateMultiplied = input.offPeakMultiplier
    ? applyRationalMultiplier(baseUnits, input.offPeakMultiplier)
    : baseUnits;
  const candidateBonus = input.tierBonusPercent
    ? bonusUnitsForPercent(input.tierBonusPercent)
    : 0;
  return {
    baseUnits,
    multipliedUnits:
      candidateMultiplied - baseUnits >= candidateBonus
        ? candidateMultiplied
        : baseUnits,
    bonusUnits:
      candidateMultiplied - baseUnits >= candidateBonus ? 0 : candidateBonus,
    totalUnits: Math.max(candidateMultiplied, baseUnits + candidateBonus),
  };
}

/** Summaga bog'liq bosqichlar, 11-banddagi qiymatlar (tahrirlanadigan). */
export interface AmountTier {
  minSom: number;
  bonusPercent: number;
}

export const DEFAULT_AMOUNT_TIERS: AmountTier[] = [
  { minSom: 120_000, bonusPercent: 20 },
  { minSom: 80_000, bonusPercent: 10 },
  { minSom: 50_000, bonusPercent: 5 },
];

/**
 * Faqat ENG YUQORI mos bosqichni tanlaydi (spetsifikatsiya: "Katta chek
 * uchun faqat eng yuqori bitta bosqich qo'llansin").
 */
export function selectAmountTierBonus(
  purchaseSom: number,
  tiers: AmountTier[] = DEFAULT_AMOUNT_TIERS,
): number {
  const sorted = [...tiers].sort((a, b) => b.minSom - a.minSom);
  for (const tier of sorted) {
    if (purchaseSom >= tier.minSom) return tier.bonusPercent;
  }
  return 0;
}
