import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { staff, cashiers } from "../auth/access.js";
import { id, key } from "../core.js";
import { inspectReservation, redeem } from "../services/redemption.service.js";
export function registerCashierRoutes(app: FastifyInstance) {
  app.post("/cashier/inspect", async (req) => {
    const s = await staff(req, cashiers);
    const b = z
      .object({
        qrToken: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        reservationId: id.optional(),
        backupCode: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
      })
      .refine((b) => !!b.qrToken || !!(b.reservationId && b.backupCode))
      .parse(req.body);
    return inspectReservation(b, s);
  });
  app.post("/cashier/confirm", async (req) => {
    const s = await staff(req, cashiers);
    const b = z
      .object({
        reservationId: id,
        proof: z.string().length(64),
        idempotencyKey: key,
      })
      .parse(req.body);
    return redeem(b.reservationId, b.proof, s, b.idempotencyKey);
  });
}
