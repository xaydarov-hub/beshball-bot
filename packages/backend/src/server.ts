import "./config.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { prisma } from "./core.js";
import { env } from "./config.js";
import { registerCustomerRoutes } from "./routes/customer.routes.js";
import { registerAdminRoutes } from "./routes/admin.routes.js";
import { registerCashierRoutes } from "./routes/cashier.routes.js";
import { registerWebhookRoutes } from "./routes/webhook.routes.js";
import { registerBroadcastRoutes } from "./routes/broadcast.routes.js";
import { registerAdminStatic } from "./admin-static.js";
export function buildServer(options: { adminDirectory?: string } = {}) {
  const app = Fastify({
    logger:
      process.env.NODE_ENV === "test"
        ? false
        : {
            redact: [
              "req.headers.x-telegram-init-data",
              "req.headers.x-bot-secret",
              "req.headers.x-telegram-bot-api-secret-token",
              "req.headers.authorization",
            ],
          },
    bodyLimit: 12 * 1024 * 1024,
    trustProxy: false,
    rewriteUrl: options.adminDirectory
      ? (req) =>
          req.url?.startsWith("/api/") ? req.url.slice(4) : (req.url ?? "/")
      : undefined,
  });
  app.register(cors, {
    origin: env.frontendOrigin,
    allowedHeaders: ["Content-Type", "X-Telegram-Init-Data"],
  });
  app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Cache-Control", "no-store");
    return payload;
  });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError)
      return reply.code(400).send({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    const e = err as any;
    const code =
      e.code === "P2002"
        ? 409
        : e.code === "P2025"
          ? 404
          : (e.statusCode ?? 500);
    return reply.code(code).send({
      error:
        code >= 500
          ? "Server xatosi. Qayta urinib ko‘ring."
          : e.code === "P2002"
            ? "Bu ma’lumot yoki operatsiya oldin saqlangan"
            : e.code === "P2025"
              ? "Ma’lumot topilmadi"
              : e.message,
    });
  });
  app.addHook("preSerialization", async (_req, _reply, payload) =>
    JSON.parse(
      JSON.stringify(payload, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    ),
  );
  app.get("/health", () => ({ ok: true, service: "BeshBall" }));
  app.get("/ready", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  });
  app.register(async (a) => registerCustomerRoutes(a));
  registerAdminRoutes(app);
  registerCashierRoutes(app);
  registerWebhookRoutes(app);
  registerBroadcastRoutes(app);
  if (options.adminDirectory) registerAdminStatic(app, options.adminDirectory);
  return app;
}
