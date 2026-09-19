import test from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
const { buildServer } = await import("../src/server.js");
test("Queue polling has its own rate allowance and still requires bot authentication", async () => {
  const app = buildServer();
  try {
    for (let n = 0; n < 130; n++) {
      const reply = await app.inject({
        method: "GET",
        url: "/bot/updates/next",
      });
      assert.equal(reply.statusCode, 401);
    }
    assert.equal(
      (await app.inject({ method: "GET", url: "/health" })).statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ method: "GET", url: "/admin/me" })).statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});
