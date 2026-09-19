import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyTelegramInitData } from "../src/auth/telegram-init-data.js";
import { parseReceiptText } from "../src/adapters/ocr/tesseract.adapter.js";
const token = "123:test-only";
function sign(auth_date: string) {
  const p = { auth_date, user: JSON.stringify({ id: 123 }) };
  const key = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", key)
    .update(
      Object.entries(p)
        .sort()
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    )
    .digest("hex");
  return new URLSearchParams({ ...p, hash }).toString();
}
test("13: initData rejects invalid/future time and fake signature", () => {
  assert.throws(() => verifyTelegramInitData(sign("NaN"), token));
  assert.throws(() =>
    verifyTelegramInitData(
      sign(String(Math.floor(Date.now() / 1000) + 3600)),
      token,
    ),
  );
  assert.throws(() =>
    verifyTelegramInitData(
      sign(String(Math.floor(Date.now() / 1000))),
      "wrong",
    ),
  );
});
test("OCR money decimals and Tashkent date", () => {
  const parsed = parseReceiptText(
    "Besh Bola Lavash\nChek 12345\n06.09.2026 23:30\nJami 32 000.00 UZS",
  );
  assert.equal(parsed.amountSom, 32000);
  assert.equal(parsed.purchasedAtIso, "2026-09-06T18:30:00.000Z");
  assert.equal(parsed.receiptExternalId, "12345");
});
test("OCR ignores impossible dates without discarding the amount", () => {
  for (const date of [
    "31.02.2026 12:30",
    "99.99.2026 25:61",
    "29.02.2025 10:00",
  ]) {
    const result = parseReceiptText(`Jami 32 000.00 UZS\n${date}`);
    assert.equal(result.purchasedAtIso, undefined);
    assert.equal(result.amountSom, 32000);
  }
  assert.equal(
    parseReceiptText("29.02.2024 00:10").purchasedAtIso,
    "2024-02-28T19:10:00.000Z",
  );
});
