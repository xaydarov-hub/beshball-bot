import test from "node:test";
import assert from "node:assert/strict";
process.env.TELEGRAM_BOT_TOKEN = "123456:UNIT_TEST_ONLY";
process.env.BACKEND_URL = "http://receipt-api.test";
process.env.ADMIN_URL = "https://beshball.example";
process.env.SUPER_ADMIN_TELEGRAM_IDS = "1234";
const { bot } = await import("../src/bot.js");
bot.botInfo = {
  id: 123456,
  is_bot: true,
  first_name: "Test",
  username: "TestBot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
};
let state: any;
let branchCount = 2;
let storageUnavailable = false;
const requests: { path: string; method: string }[] = [];
const replies: any[] = [];
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  requests.push({ path: url.pathname, method: options?.method ?? "GET" });
  if (url.origin === "https://api.telegram.org") {
    assert.match(
      url.pathname,
      /^\/file\/bot123456:UNIT_TEST_ONLY\/receipt.png$/,
    );
    return new Response(new Uint8Array([1, 2, 3]));
  }
  assert.equal(url.origin, "http://receipt-api.test");
  if (storageUnavailable) throw new Error("Session database unavailable");
  let data: any;
  if (url.pathname.startsWith("/bot/sessions/")) {
    if (options?.method === "PUT") state = JSON.parse(String(options.body));
    data = state;
  } else if (url.pathname === "/branches")
    data = Array.from({ length: branchCount }, (_, i) => ({
      id: `branch-${i}`,
      name: `Filial ${i}`,
    }));
  else if (url.pathname === "/customers/customer-test/receipts")
    data = { receiptId: "receipt-test", status: "RECEIVED" };
  else throw new Error(`Unexpected API ${url.pathname}`);
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
};
bot.api.config.use(async (_previous, method, payload) => {
  replies.push({ method, ...payload });
  return {
    ok: true,
    result:
      method === "getFile"
        ? {
            file_id: "photo-test",
            file_unique_id: "unique",
            file_path: "receipt.png",
            file_size: 3,
          }
        : method === "answerCallbackQuery"
          ? true
          : { message_id: 1, date: 1, chat: { id: 1234, type: "private" } },
  } as any;
});
let updateId = 1;
const sender = { id: 1234, is_bot: false, first_name: "Admin" };
const chat = { id: 1234, type: "private" as const, first_name: "Admin" };
async function photo() {
  await bot.handleUpdate({
    update_id: ++updateId,
    message: {
      message_id: updateId,
      date: 1,
      from: sender,
      chat,
      photo: [
        {
          file_id: "photo-test",
          file_unique_id: "unique",
          width: 10,
          height: 10,
        },
      ],
    },
  });
}
test("Admin opens even when registration/session storage is unavailable", async () => {
  storageUnavailable = true;
  requests.length = 0;
  await bot.handleUpdate({
    update_id: ++updateId,
    message: {
      message_id: updateId,
      date: 1,
      from: sender,
      chat,
      text: "/admin",
      entities: [{ type: "bot_command", offset: 0, length: 6 }],
    },
  });
  assert.equal(requests.length, 0);
  assert.equal(
    replies.at(-1).reply_markup.inline_keyboard[0][0].web_app.url,
    process.env.ADMIN_URL,
  );
  storageUnavailable = false;
});
test("A photo sent before branch selection is retained and uploaded after selection", async () => {
  state = { locale: "uz", customerId: "customer-test", feedback: false };
  branchCount = 2;
  requests.length = 0;
  await photo();
  assert.equal(state.pendingReceiptFileId, "photo-test");
  assert.equal(
    requests.some((r) => r.path.endsWith("/receipts")),
    false,
  );
  await bot.handleUpdate({
    update_id: ++updateId,
    callback_query: {
      id: "callback-test",
      chat_instance: "test",
      from: sender,
      data: "branch:receipt:branch-1",
      message: { message_id: 1, date: 1, chat },
    },
  });
  assert.equal(requests.filter((r) => r.path.endsWith("/receipts")).length, 1);
  assert.equal(state.branchId, "branch-1");
  assert.equal(state.pendingReceiptFileId, undefined);
  assert.match(replies.at(-1).text, /avtomatik tekshiradi/);
});
test("The only branch is selected automatically for an incoming receipt", async () => {
  state = { locale: "uz", customerId: "customer-test" };
  branchCount = 1;
  requests.length = 0;
  await photo();
  assert.equal(state.branchId, "branch-0");
  assert.equal(requests.filter((r) => r.path.endsWith("/receipts")).length, 1);
});
