import test from "node:test";
import assert from "node:assert/strict";
import {
  ballsFromUnits,
  spendBalls,
  computeReceiptUnits,
  selectBestCampaign,
  isReceiptWithinAcceptanceWindow,
  checkReferralGuard,
  rewardGoalProgress,
} from "../src/index.js";
test("Gift progress retains partial balls and caps completed goals", () => {
  assert.equal(rewardGoalProgress(265000, 7).requiredUnits, 435000);
  assert.equal(rewardGoalProgress(32000, 1).currentProgressPercent, 32);
  assert.equal(rewardGoalProgress(530000, 7).requiredUnits, 170000);
  assert.equal(rewardGoalProgress(735000, 7).requiredUnits, 0);
  assert.equal(rewardGoalProgress(735000, 7).currentProgressPercent, 100);
  assert.throws(() => rewardGoalProgress(0, Number.MAX_SAFE_INTEGER));
});
test("Receipt math never stacks multiplier and flat campaign bonus", () => {
  assert.equal(
    computeReceiptUnits({
      purchaseSom: 80000,
      offPeakMultiplier: { num: 3, den: 2 },
      tierBonusPercent: 10,
    }).totalUnits,
    120000,
  );
  assert.equal(
    computeReceiptUnits({
      purchaseSom: 30000,
      offPeakMultiplier: { num: 3, den: 2 },
      tierBonusPercent: 25,
    }).totalUnits,
    55000,
  );
});
test("1–5: exact units, progress, spending, percentage and multiplier", () => {
  assert.deepEqual(ballsFromUnits(32000 + 36000 + 42000), {
    balls: 1,
    progressUnits: 10000,
    progressPercent: 10,
  });
  assert.equal(ballsFromUnits(700000).balls, 7);
  assert.equal(spendBalls(735000, 7), 35000);
  assert.equal(
    computeReceiptUnits({ purchaseSom: 80000, tierBonusPercent: 10 })
      .totalUnits,
    90000,
  );
  assert.equal(
    computeReceiptUnits({
      purchaseSom: 32000,
      offPeakMultiplier: { num: 3, den: 2 },
    }).totalUnits,
    48000,
  );
});
test("8–10: exact 120 minutes, next second, midnight, future and invalid dates", () => {
  const purchase = Date.parse("2026-09-06T23:30:00+05:00");
  assert.equal(
    isReceiptWithinAcceptanceWindow(purchase + 7200000, purchase),
    true,
  );
  assert.equal(
    isReceiptWithinAcceptanceWindow(purchase + 7201000, purchase),
    false,
  );
  assert.equal(
    isReceiptWithinAcceptanceWindow(purchase - 1000, purchase),
    false,
  );
  assert.equal(isReceiptWithinAcceptanceWindow(NaN, purchase), false);
});
test("23–24: self-referral, prior customer, monthly cap and one best campaign", () => {
  const base = {
    referrerCustomerId: "a",
    newCustomerId: "b",
    referrerRewardsThisMonth: 0,
    maxRewardsPerMonth: 5,
    newCustomerIsPreExisting: false,
  };
  assert.equal(
    checkReferralGuard({ ...base, newCustomerId: "a" }).allowed,
    false,
  );
  assert.equal(
    checkReferralGuard({ ...base, newCustomerIsPreExisting: true }).allowed,
    false,
  );
  assert.equal(
    checkReferralGuard({ ...base, referrerRewardsThisMonth: 5 }).allowed,
    false,
  );
  assert.equal(
    selectBestCampaign([
      { kind: "AMOUNT_TIER", active: true, eligible: true, bonusPercent: 10 },
      {
        kind: "BIRTHDAY_WINDOW",
        active: true,
        eligible: true,
        bonusPercent: 25,
      },
    ])?.bonusPercent,
    25,
  );
});
