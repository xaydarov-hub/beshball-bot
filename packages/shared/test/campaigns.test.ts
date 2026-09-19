import {
  selectBestCampaign,
  checkReferralGuard,
  isReceiptWithinAcceptanceWindow,
} from "../src/campaigns.js";

let passed = 0;
let failed = 0;
function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`OK   ${label}`);
  } else {
    failed++;
    console.error(
      `FAIL ${label}: kutilgan=${JSON.stringify(expected)} olingan=${JSON.stringify(actual)}`,
    );
  }
}

// Test24: bir chekda kampaniyalar qo'shilib ketmasligi - eng kattasi tanlanadi
{
  const best = selectBestCampaign([
    { kind: "AMOUNT_TIER", bonusPercent: 10, active: true, eligible: true },
    {
      kind: "SECOND_PURCHASE_7D",
      bonusPercent: 15,
      active: true,
      eligible: true,
    },
    {
      kind: "BIRTHDAY_WINDOW",
      bonusPercent: 25,
      active: false,
      eligible: true,
    },
  ]);
  assertEqual(
    best?.kind,
    "SECOND_PURCHASE_7D",
    "Test24a: eng katta faol foiz tanlanadi (15%)",
  );
}
{
  const best = selectBestCampaign([
    { kind: "AMOUNT_TIER", bonusPercent: 5, active: false, eligible: true },
  ]);
  assertEqual(best, null, "Test24b: faol nomzod bo'lmasa null");
}

// Test23: referalni o'ziga yuborish
{
  const r = checkReferralGuard({
    referrerCustomerId: "c1",
    newCustomerId: "c1",
    referrerRewardsThisMonth: 0,
    maxRewardsPerMonth: 5,
    newCustomerIsPreExisting: false,
  });
  assertEqual(
    r,
    { allowed: false, reason: "SELF_REFERRAL" },
    "Test23: o'zini taklif qilish rad etiladi",
  );
}
{
  const r = checkReferralGuard({
    referrerCustomerId: "c1",
    newCustomerId: "c2",
    referrerRewardsThisMonth: 5,
    maxRewardsPerMonth: 5,
    newCustomerIsPreExisting: false,
  });
  assertEqual(r.allowed, false, "Test23b: oylik limitdan keyin rad etiladi");
}

// Test8/9/10: 120 daqiqalik chek qabul qilish oynasi
{
  const purchase = Date.parse("2026-09-06T10:00:00+05:00");
  const okAt = purchase + 119 * 60_000;
  const lateAt = purchase + 121 * 60_000;
  assertEqual(
    isReceiptWithinAcceptanceWindow(okAt, purchase),
    true,
    "Test8a: 119 daqiqada qabul qilinadi",
  );
  assertEqual(
    isReceiptWithinAcceptanceWindow(lateAt, purchase),
    false,
    "Test8b: 121 daqiqada rad etiladi",
  );
  assertEqual(
    isReceiptWithinAcceptanceWindow(purchase - 60_000, purchase),
    false,
    "Test10: kelajakdagi xarid vaqti rad etiladi",
  );
}

console.log(`\n${passed} ta test o'tdi, ${failed} ta muvaffaqiyatsiz.`);
if (failed > 0) process.exit(1);
