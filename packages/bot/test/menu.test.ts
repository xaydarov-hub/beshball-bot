import test from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = "123456:UNIT_TEST_ONLY";
process.env.BACKEND_URL = "http://bot-api.test";
const { bot } = await import("../src/bot.js");
bot.botInfo = {
  id: 123456,
  is_bot: true,
  first_name: "Test",
  username: "BeshBallTestBot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
};
const requests: string[] = [];
const replies: any[] = [];
let state: any = { locale: "uz", customerId: "customer-test" };
// Real grammY routing and session middleware; no Telegram/network requests.
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  assert.equal(url.origin, "http://bot-api.test");
  requests.push(url.pathname);
  let data: any;
  if (url.pathname.startsWith("/bot/sessions/")) {
    if (options?.method === "PUT") state = JSON.parse(String(options.body));
    data = state;
  } else if (url.pathname === "/branches")
    data = [{ id: "branch-test", name: "Sinov filial" }];
  else if (url.pathname.endsWith("/history")) data = [];
  else if (url.pathname.endsWith("/club-card"))
    data = {
      totalBalls: 2,
      availableBalls: 2,
      reservedBalls: 0,
      nextBallProgressPercent: 65,
      remainingToNextBall: 35000,
      referralPayload: "ref_1234",
      nextGoal: {
        titleUz: "Pitsa",
        titleRu: "Пицца",
        targetBalls: 7,
        progress: {
          earnedBalls: 2,
          currentProgressPercent: 37,
          requiredUnits: 435000,
        },
      },
    };
  else throw new Error(`Unexpected API route ${url.pathname}`);
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
};
bot.api.config.use(async (_previous, method, payload) => {
  replies.push({ method, ...payload });
  return {
    ok: true,
    result:
      method === "answerCallbackQuery"
        ? true
        : {
            message_id: 1,
            date: 1,
            chat: { id: 1234, type: "private" },
            text: "Test",
          },
  } as any;
});
let updateId = 100;
async function callback(data: string) {
  await bot.handleUpdate({
    update_id: ++updateId,
    callback_query: {
      id: String(updateId),
      chat_instance: "test",
      from: { id: 1234, is_bot: false, first_name: "Test" },
      data,
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 1234, type: "private", first_name: "Test" },
      },
    },
  });
}
test("All three club card buttons acknowledge and execute their actions", async () => {
  await callback("reward:goal");
  assert.ok(requests.includes("/branches"));
  await callback("referral:share");
  assert.ok(
    replies.some((r) =>
      String(r.text).includes("https://t.me/BeshBallTestBot?start=ref_1234"),
    ),
  );
  await callback("history:card");
  assert.ok(requests.includes("/bot/customers/customer-test/history"));
  assert.equal(
    replies.filter((r) => r.method === "answerCallbackQuery").length,
    3,
  );
});
test("Balance message includes exact remaining spend and reserved balls", async () => {
  await bot.handleUpdate({
    update_id: ++updateId,
    message: {
      message_id: 2,
      date: 1,
      chat: { id: 1234, type: "private", first_name: "Test" },
      from: { id: 1234, is_bot: false, first_name: "Test" },
      text: "💰 BeshBallarim",
    },
  });
  const reply = replies.at(-1);
  assert.match(reply.text, /435\s000/);
  assert.match(reply.text, /Band qilingan: 0/);
  assert.match(reply.text, /start=ref_1234/);
  assert.equal(reply.text.includes("undefined"), false);
});
