/**
 * Bu fayl HECH QANDAY tashqi test-framework (vitest/jest) ga bog'liq emas -
 * shunchaki node/tsx bilan to'g'ridan-to'g'ri ishga tushiriladi:
 *   npx tsx packages/shared/test/points-engine.test.ts
 * Shu tufayli internetga ulanmagan muhitda ham HAQIQIY ishlaydi va
 * BUSINESS_RULES.md dagi 15-banddagi 1-5 misollarni tasdiqlaydi.
 */
import {
  unitsFromPurchaseSom,
  applyRationalMultiplier,
  ballsFromUnits,
  spendBalls,
  computeReceiptUnits,
  selectAmountTierBonus,
  rewardGoalProgress,
  UNITS_PER_BALL,
} from "../src/points-engine.js";

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

// --- 15-band, 1-misol: 32000+36000+42000 = 1 ball va 10% progress ---
{
  const total =
    unitsFromPurchaseSom(32_000) +
    unitsFromPurchaseSom(36_000) +
    unitsFromPurchaseSom(42_000);
  const { balls, progressPercent } = ballsFromUnits(total);
  assertEqual(balls, 1, "Test1: balls=1");
  assertEqual(progressPercent, 10, "Test1: progress=10%");
}

// --- 15-band, 2-misol: 700000 = 7 ball ---
{
  const { balls, progressUnits } = ballsFromUnits(700_000);
  assertEqual(balls, 7, "Test2: balls=7");
  assertEqual(progressUnits, 0, "Test2: progressUnits=0");
}

// --- 15-band, 3-misol: 735000 dan 7 ball sarflansa 35000 qoladi ---
{
  const remaining = spendBalls(735_000, 7);
  assertEqual(remaining, 35_000, "Test3: remaining=35000");
}

// --- 15-band, 4-misol: 80000 xarid +10% bonus = 90000 birlik ---
{
  const tierPercent = selectAmountTierBonus(80_000);
  assertEqual(tierPercent, 10, "Test4: tanlangan bosqich = 10%");
  const result = computeReceiptUnits({
    purchaseSom: 80_000,
    tierBonusPercent: tierPercent,
  });
  assertEqual(result.totalUnits, 90_000, "Test4: totalUnits=90000");
}

// --- 15-band, 5-misol: 32000 x1.5 = 48000 birlik ---
{
  const result = computeReceiptUnits({
    purchaseSom: 32_000,
    offPeakMultiplier: { num: 3, den: 2 },
  });
  assertEqual(result.multipliedUnits, 48_000, "Test5: multipliedUnits=48000");
}

// --- Qo'shimcha: faqat eng yuqori bosqich tanlanishi (120000 dan yuqori) ---
{
  const percent = selectAmountTierBonus(150_000);
  assertEqual(percent, 20, "Test6: 150000 uchun eng yuqori bosqich 20%");
}

// --- Qo'shimcha: 50000 dan past summa uchun bonus yo'q ---
{
  const percent = selectAmountTierBonus(49_999);
  assertEqual(percent, 0, "Test7: 49999 uchun bonus yo'q");
}

// --- Qo'shimcha: balansdan ortiq sarflash xato berishi kerak (18-test bilan bog'liq) ---
{
  let threw = false;
  try {
    spendBalls(100_000, 2); // 200000 kerak, bor-yo'g'i 100000
  } catch {
    threw = true;
  }
  assertEqual(
    threw,
    true,
    "Test8: yetarli bo'lmagan balansdan sarflash xato beradi",
  );
}

// --- Qo'shimcha: UNITS_PER_BALL konstantasi to'g'ri ---
{
  assertEqual(UNITS_PER_BALL, 100_000, "Test9: UNITS_PER_BALL=100000");
}

// --- Qo'shimcha: multiplikator floor bilan pastga yaxlitlanadi ---
{
  // 33333 * 3/2 = 49999.5 -> floor -> 49999
  const result = applyRationalMultiplier(33_333, { num: 3, den: 2 });
  assertEqual(result, 49_999, "Test10: yarim birlik pastga yaxlitlanadi");
}

// --- Qo'shimcha: manfiy yoki noto'g'ri kirish rad etiladi ---
{
  let threw = false;
  try {
    unitsFromPurchaseSom(-5);
  } catch {
    threw = true;
  }
  assertEqual(threw, true, "Test11: manfiy summa rad etiladi");
}

// --- Besh Bola Club karta progressi: 32k -> 32% progress, 68k qolgan ---
{
  const p = ballsFromUnits(32_000);
  assertEqual(p.balls, 0, "Test12a: 32000 = 0 ball");
  assertEqual(p.progressPercent, 32, "Test12b: 32000 = 32% progress");
  assertEqual(p.progressUnits, 32_000, "Test12c: 32000 progress units");
}

// --- Sovg'a maqsadi: 5/7 to'ldi, 2 ball qolgan ---
{
  const goal = rewardGoalProgress(530_000, 7);
  assertEqual(goal.earnedBalls, 5, "Test13a: 530k -> 5/7 to'ldi");
  assertEqual(goal.remainingBalls, 2, "Test13b: 2 ball qolgan");
  assertEqual(goal.canRedeem, false, "Test13c: hali yetarli emas");
}

{
  const goal = rewardGoalProgress(700_000, 7);
  assertEqual(goal.earnedBalls, 7, "Test14a: 700k -> 7/7 to'ldi");
  assertEqual(goal.remainingBalls, 0, "Test14b: sovg'a tayyor");
  assertEqual(goal.canRedeem, true, "Test14c: sovg'a olish mumkin");
}

console.log(`\n${passed} ta test o'tdi, ${failed} ta muvaffaqiyatsiz.`);
if (failed > 0) {
  process.exit(1);
}
