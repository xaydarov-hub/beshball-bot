import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAutoApproval } from "../src/services/auto-review.service.js";

const cfg = {
  autoApproveEnabled: 1,
  autoApproveMinConfidence: 80,
  autoApproveMinAmountSom: 5000,
  autoApproveMaxAmountSom: 500000,
  autoApproveMerchantNames: ["BESH BOLA LAVASH"],
  receiptMinutes: 120,
};
const now = Date.now();
// "BESH BOLA LAVASH" cheki namunasi: Jami 114 400 so'm, sana 19.09.2026 17:20.
const clean = {
  ocrConfidencePercent: 91,
  ocrAmountSom: 114_400,
  ocrPurchasedAtMs: now - 10 * 60_000,
  ocrRawText: "BESH BOLA LAVASH\nSana: 16:35 19.09.2026\n...\nJami: 114 400",
  firstReceivedAtMs: now,
  duplicateFlagCount: 0,
  branchId: "branch-1",
  branchActive: true,
};

test("Aniq va ishonchli chek avtomatik tasdiqlash uchun mos keladi", () => {
  assert.deepEqual(evaluateAutoApproval(clean, cfg), []);
});

test("Past OCR ishonchi avtomatik tasdiqlashni rad etadi", () => {
  const reasons = evaluateAutoApproval({ ...clean, ocrConfidencePercent: 40 }, cfg);
  assert.ok(reasons.some((r) => r.includes("ishonchi past")));
});

test("Summasi o'qilmagan chek shubhali deb belgilanadi", () => {
  const reasons = evaluateAutoApproval({ ...clean, ocrAmountSom: null }, cfg);
  assert.ok(reasons.some((r) => r.includes("Summa")));
});

test("120 daqiqalik oynadan tashqari chek avtomatik o'tmaydi", () => {
  const reasons = evaluateAutoApproval(
    { ...clean, ocrPurchasedAtMs: now - 200 * 60_000 },
    cfg,
  );
  assert.ok(reasons.some((r) => r.includes("oynasidan tashqarida")));
});

test("O'xshash rasm (mumkin bo'lgan dublikat) operatorga yuboriladi", () => {
  const reasons = evaluateAutoApproval({ ...clean, duplicateFlagCount: 1 }, cfg);
  assert.ok(reasons.some((r) => r.includes("o'xshash")));
});

test("Tanilmagan do'kon nomi avtomatik tasdiqlanmaydi", () => {
  const reasons = evaluateAutoApproval(
    { ...clean, ocrRawText: "BOSHQA DO'KON\nJami: 50000" },
    cfg,
  );
  assert.ok(reasons.some((r) => r.includes("Do'kon nomi")));
});

test("Faol bo'lmagan filialdagi chek qo'lda tekshiruvga boradi", () => {
  const reasons = evaluateAutoApproval({ ...clean, branchActive: false }, cfg);
  assert.ok(reasons.some((r) => r.includes("Filial faol emas")));
});

test("O'chirilgan avtomatik tasdiqlash hech qachon o'tkazmaydi", () => {
  const reasons = evaluateAutoApproval(clean, { ...cfg, autoApproveEnabled: 0 });
  assert.ok(reasons.some((r) => r.includes("o'chirilgan")));
});
