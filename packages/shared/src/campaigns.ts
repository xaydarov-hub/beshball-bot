/**
 * Aksiya tanlash mantig'i (11-band).
 *
 * TAXMIN (hujjatlashtirilgan, BUSINESS_RULES.md ga qarang): bir nechta
 * SUMMA-BOSQICH (amount-tier) aksiya mos kelsa, faqat eng yuqori bosqich
 * ishlatiladi (spetsifikatsiyada aniq talab). Boshqa turdagi aksiyalar
 * (referral, tug'ilgan kun, qaytish, ikkinchi xarid) summa-bosqich bilan
 * bir vaqtda potentsial mos kelishi mumkin bo'lgani uchun, "eng foydali
 * bittasi" qoidasi shu yerda: barcha nomzod foizlar orasidan ENG KATTASI
 * tanlanadi va faqat SHU BITTASI qo'llanadi (chek boshiga bitta bonus).
 */

export type CampaignKind =
  | "SECOND_PURCHASE_7D"
  | "REFERRAL_FIRST_PURCHASE"
  | "AMOUNT_TIER"
  | "WINBACK_21D"
  | "BIRTHDAY_WINDOW"
  | "OFF_PEAK_MULTIPLIER";

export interface CampaignCandidate {
  kind: CampaignKind;
  bonusPercent: number; // OFF_PEAK_MULTIPLIER uchun 0, u alohida multiplikator sifatida qo'llanadi
  active: boolean;
  /** shu chekka nisbatan shart bajarilganmi (chaqiruvchi tomonidan oldindan tekshiriladi) */
  eligible: boolean;
}

/**
 * Nomzodlar orasidan ENG YUQORI foizli, faol va mos bo'lgan bittasini tanlaydi.
 * Hech biri mos kelmasa, null qaytaradi.
 */
export function selectBestCampaign(
  candidates: CampaignCandidate[],
): CampaignCandidate | null {
  const eligible = candidates.filter(
    (c) => c.active && c.eligible && c.kind !== "OFF_PEAK_MULTIPLIER",
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((best, c) =>
    c.bonusPercent > best.bonusPercent ? c : best,
  );
}

export interface ReferralGuardInput {
  referrerCustomerId: string;
  newCustomerId: string;
  referrerRewardsThisMonth: number;
  maxRewardsPerMonth: number;
  newCustomerIsPreExisting: boolean;
}

export interface ReferralGuardResult {
  allowed: boolean;
  reason?: string;
}

/** Referal bonusi berilishidan oldingi barcha qo'riqlovchi tekshiruvlar. */
export function checkReferralGuard(
  input: ReferralGuardInput,
): ReferralGuardResult {
  if (input.referrerCustomerId === input.newCustomerId) {
    return { allowed: false, reason: "SELF_REFERRAL" };
  }
  if (input.newCustomerIsPreExisting) {
    return { allowed: false, reason: "NOT_A_NEW_CUSTOMER" };
  }
  if (input.referrerRewardsThisMonth >= input.maxRewardsPerMonth) {
    return { allowed: false, reason: "MONTHLY_REFERRAL_LIMIT_REACHED" };
  }
  return { allowed: true };
}

/** 120 daqiqalik chek qabul qilish muddatini tekshiradi (server vaqtiga nisbatan). */
export function isReceiptWithinAcceptanceWindow(
  receiptFirstReceivedAtMs: number,
  purchaseTimestampMs: number,
  windowMinutes = 120,
): boolean {
  const diffMs = receiptFirstReceivedAtMs - purchaseTimestampMs;
  if (diffMs < 0) return false; // kelajakdagi xarid vaqti
  return diffMs <= windowMinutes * 60_000;
}
