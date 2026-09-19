import test from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = "123456:UNIT_TEST_ONLY";
process.env.BOT_API_SECRET = "unit-test-secret-with-at-least-32-characters";
process.env.BACKEND_URL = "http://registration.test";
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
let session: any = null;
let registered: any = null;
const replies: any[] = [];
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  assert.equal(url.origin, "http://registration.test");
  const headers = new Headers(options?.headers);
  assert.equal(headers.get("x-bot-secret"), process.env.BOT_API_SECRET);
  assert.equal(headers.get("x-telegram-user-id"), "1234");
  let data: any;
  let status = 200;
  if (url.pathname === "/bot/sessions/1234") {
    if (options?.method === "PUT") session = JSON.parse(String(options.body));
    data = session;
  } else if (url.pathname === "/bot/customers/by-telegram/1234") {
    data = registered
      ? { customerId: "customer-registered", locale: "uz" }
      : { error: "Mijoz topilmadi" };
    if (!registered) status = 404;
  } else if (url.pathname === "/bot/register") {
    registered = JSON.parse(String(options?.body));
    data = { customerId: "customer-registered" };
  } else throw new Error(`Unexpected route: ${url.pathname}`);
  return new Response(JSON.stringify(data), {
    status,
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
let updateId = 0;
const from = { id: 1234, is_bot: false, first_name: "Test" };
const chat = { id: 1234, type: "private" as const };
async function message(payload: any) {
  await bot.handleUpdate({
    update_id: ++updateId,
    message: {
      message_id: updateId,
      date: 1,
      from,
      chat,
      ...payload,
    },
  });
}
async function callback(data: string) {
  await bot.handleUpdate({
    update_id: ++updateId,
    callback_query: {
      id: String(updateId),
      chat_instance: "test",
      from,
      data,
      message: { message_id: 1, date: 1, chat },
    },
  });
}
test("Registration verifies contact, preserves consent choices, and restores menu after session loss", async () => {
  const start = {
    text: "/start",
    entities: [{ type: "bot_command", offset: 0, length: 6 }],
  };
  await message(start);
  assert.match(replies.at(-1).text, /Tilni tanlang/);
  await callback("register:uz");
  await message({
    contact: {
      phone_number: "998900000000",
      first_name: "Other",
      user_id: 999,
    },
  });
  assert.equal(session.step, "contact");
  assert.equal(registered, null);
  await message({
    contact: {
      phone_number: "998900000000",
      first_name: "Test",
      user_id: 1234,
    },
  });
  assert.equal(session.step, "name");
  await message({ text: "Sinov Mijoz" });
  assert.equal(session.step, "consent");
  await callback("consent:yes");
  await callback("marketing:no");
  await callback("birthday:skip");
  assert.equal(registered.phoneE164, "+998900000000");
  assert.equal(registered.telegramUserId, 1234);
  assert.equal(registered.fullName, "Sinov Mijoz");
  assert.equal(registered.marketingConsent, false);
  assert.ok(Number.isFinite(Date.parse(registered.dataConsentAt)));
  assert.equal(session.customerId, "customer-registered");
  assert.equal(session.phone, undefined);
  session = null;
  await message(start);
  assert.equal(session.customerId, "customer-registered");
  assert.ok(
    replies
      .at(-1)
      .reply_markup.keyboard.flat()
      .some((button: any) => button.text === "💰 BeshBallarim"),
  );
});
