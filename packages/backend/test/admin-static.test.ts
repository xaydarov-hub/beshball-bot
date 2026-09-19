import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";

test("Cloud admin serves SPA/assets and preserves authenticated API boundaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "beshball-admin-"));
  await mkdir(join(directory, "assets"));
  await writeFile(
    join(directory, "index.html"),
    "<!doctype html><h1>BeshBall</h1>",
  );
  await writeFile(join(directory, "assets/app.js"), "console.log('BeshBall');");
  await writeFile(join(directory, ".env"), "MUST_NOT_BE_PUBLIC");
  const app = buildServer({ adminDirectory: directory });
  try {
    for (const route of ["/", "/cheklar", "/kassir", "/sozlamalar"]) {
      const response = await app.inject(route);
      assert.equal(response.statusCode, 200, route);
      assert.match(response.headers["content-type"]!, /text\/html/);
      assert.match(
        response.headers["content-security-policy"]!,
        /frame-ancestors https:\/\/web.telegram.org/,
      );
    }
    const asset = await app.inject("/assets/app.js");
    assert.equal(asset.statusCode, 200);
    assert.match(asset.headers["content-type"]!, /javascript/);
    assert.equal((await app.inject("/api/health")).json().service, "BeshBall");
    assert.equal((await app.inject("/api/gifts")).statusCode, 401);
    assert.equal((await app.inject("/api/admin/me")).statusCode, 401);
    for (const route of [
      "/.env",
      "/assets/../.env",
      "/assets/%2e%2e%2f.env",
      "/assets/%5c..%5c.env",
      "/assets/missing.js",
      "/api/unknown",
    ]) {
      const response = await app.inject(route);
      assert.ok(
        [400, 404].includes(response.statusCode),
        `${route}: ${response.statusCode}`,
      );
      assert.equal(response.body.includes("MUST_NOT_BE_PUBLIC"), false);
    }
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
