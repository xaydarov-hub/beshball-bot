import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { env } from "../config.js";
import { prisma, atomic, requireThat, secureEqual, json } from "../core.js";
import { botAuth } from "../auth/access.js";
export function registerWebhookRoutes(app: FastifyInstance) {
  app.post("/telegram/webhook", async (req) => {
    requireThat(
      !!process.env.TELEGRAM_WEBHOOK_URL,
      "Webhook rejimi o‘chiq",
      404,
    );
    requireThat(
      env.webhookSecret.length >= 32 &&
        secureEqual(
          String(req.headers["x-telegram-bot-api-secret-token"] ?? ""),
          env.webhookSecret,
        ),
      "Webhook secret noto‘g‘ri",
      401,
    );
    const b = z
      .object({ update_id: z.number().int().nonnegative() })
      .passthrough()
      .parse(req.body);
    await prisma.telegramUpdate.upsert({
      where: { id: b.update_id },
      update: {},
      create: { id: b.update_id, payload: json(b) },
    });
    return { ok: true };
  });
  app.get(
    "/bot/updates/next",
    {
      // Internal authenticated polling has its own bucket, so it does not consume
      // the public/admin request allowance behind the hosting proxy.
      config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
    },
    async (req) => {
      botAuth(req);
      // Claim in one database round trip. Queue reads must not hold the global
      // balance lock or serialize unrelated customer actions.
      const leaseToken = randomUUID();
      const claimed = await prisma.$queryRaw<
        { id: number; payload: unknown; leaseToken: string }[]
      >`
      UPDATE telegram_updates AS u
      SET status = 'PROCESSING', "leaseToken" = ${leaseToken},
          "lockedAt" = now(), attempts = u.attempts + 1
      WHERE u.id = (
        SELECT id FROM telegram_updates
        WHERE (status = 'PENDING' AND "availableAt" <= now())
           OR (status = 'PROCESSING' AND "lockedAt" < now() - interval '5 minutes')
        ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
      )
      RETURNING u.id, u.payload, u."leaseToken"
    `;
      return claimed[0] ?? null;
    },
  );
  app.post("/bot/updates/:id/done", async (req) => {
    botAuth(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { leaseToken } = z
      .object({ leaseToken: z.string().uuid() })
      .parse(req.body);
    const result = await prisma.telegramUpdate.updateMany({
      where: { id, leaseToken, status: "PROCESSING" },
      data: { status: "DONE", leaseToken: null, lockedAt: null },
    });
    requireThat(result.count === 1, "Update rezervi eskirgan", 409);
    return { ok: true };
  });
  app.post("/bot/updates/:id/failed", async (req) => {
    botAuth(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { leaseToken } = z
      .object({ leaseToken: z.string().uuid() })
      .parse(req.body);
    return atomic(async (tx) => {
      const u = await tx.telegramUpdate.findUniqueOrThrow({ where: { id } });
      requireThat(
        u.leaseToken === leaseToken && u.status === "PROCESSING",
        "Update rezervi eskirgan",
        409,
      );
      await tx.telegramUpdate.update({
        where: { id },
        data: {
          status: u.attempts >= 8 ? "FAILED" : "PENDING",
          leaseToken: null,
          lockedAt: null,
          availableAt: new Date(
            Date.now() + Math.min(300, 2 ** u.attempts) * 1000,
          ),
        },
      });
      return { ok: true };
    });
  });
}
