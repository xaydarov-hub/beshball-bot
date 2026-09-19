import { createHmac } from "node:crypto";
import {
  verifyTelegramInitData,
  InitDataVerificationError,
} from "../src/auth/telegram-init-data.js";

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

const BOT_TOKEN = "123456:TEST-FAKE-TOKEN-FOR-UNIT-TEST-ONLY";

function buildValidInitData(
  overrides: Record<string, string> = {},
  authDateUnix = Math.floor(Date.now() / 1000),
) {
  const params: Record<string, string> = {
    auth_date: String(authDateUnix),
    query_id: "AAH_test",
    user: JSON.stringify({
      id: 555111222,
      first_name: "Aziz",
      username: "aziz_test",
    }),
    ...overrides,
  };
  const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();
  const hash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  const search = new URLSearchParams({ ...params, hash });
  return search.toString();
}

// Test13a: to'g'ri imzolangan initData qabul qilinadi
{
  const raw = buildValidInitData();
  const result = verifyTelegramInitData(raw, BOT_TOKEN);
  assertEqual(
    result.user.id,
    555111222,
    "Test13a: haqiqiy initData qabul qilinadi",
  );
}

// Test13b: soxta (noto'g'ri token bilan imzolangan) initData rad etiladi
{
  const raw = buildValidInitData();
  let threw = false;
  try {
    verifyTelegramInitData(raw, "999999:BOSHQA-TOKEN");
  } catch (e) {
    threw = e instanceof InitDataVerificationError;
  }
  assertEqual(threw, true, "Test13b: soxta imzo rad etiladi");
}

// Test13c: eskirgan initData rad etiladi
{
  const oldAuthDate = Math.floor(Date.now() / 1000) - 7200; // 2 soat oldin
  const raw = buildValidInitData({}, oldAuthDate);
  let threw = false;
  try {
    verifyTelegramInitData(raw, BOT_TOKEN, 3600);
  } catch (e) {
    threw = e instanceof InitDataVerificationError;
  }
  assertEqual(
    threw,
    true,
    "Test13c: eskirgan initData (maxAge dan oshgan) rad etiladi",
  );
}

// Test: hash maydoni butunlay yo'qolsa rad etiladi
{
  const raw = buildValidInitData();
  const withoutHash = raw.replace(/&hash=[^&]+/, "");
  let threw = false;
  try {
    verifyTelegramInitData(withoutHash, BOT_TOKEN);
  } catch (e) {
    threw = e instanceof InitDataVerificationError;
  }
  assertEqual(threw, true, "Test13d: hash yo'q bo'lsa rad etiladi");
}

console.log(`\n${passed} ta test o'tdi, ${failed} ta muvaffaqiyatsiz.`);
if (failed > 0) process.exit(1);
