import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { staff, managers } from "../auth/access.js";
import { prisma, atomic, audit, requireThat, id, safeUrl } from "../core.js";
const schema = z
  .object({
    titleInternal: z.string().min(2).max(100),
    bodyUz: z.string().min(1).max(900),
    bodyRu: z.string().max(900).nullable(),
    imageUrl: safeUrl.nullable(),
    buttonLabel: z.string().max(50).nullable(),
    buttonUrl: safeUrl.nullable(),
    scheduledAt: z.string().datetime().nullable(),
    audienceBranchId: id.nullable(),
  })
  .refine(
    (b) => !!b.buttonLabel === !!b.buttonUrl,
    "Tugma nomi va havola birga kiritilsin",
  );
export function registerBroadcastRoutes(app: FastifyInstance) {
  app.get("/admin/broadcasts", async (req) => {
    const s = await staff(req, managers);
    return prisma.broadcast.findMany({
      where:
        s.role === "SUPER_ADMIN"
          ? {}
          : { audienceBranchId: { in: s.branchAccess.map((b) => b.branchId) } },
      include: { recipientLogs: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
  app.post("/admin/broadcasts", async (req) => {
    const s = await staff(req, managers);
    const b = schema.parse(req.body);
    requireThat(
      s.role === "SUPER_ADMIN" ||
        s.branchAccess.some((x) => x.branchId === b.audienceBranchId),
      "Auditoriya filialiga ruxsat yo‘q",
      403,
    );
    return atomic(async (tx) => {
      const row = await tx.broadcast.create({
        data: {
          ...b,
          scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null,
          onlyConsented: true,
        },
      });
      await audit(tx, s.id, "DRAFT_BROADCAST", "Broadcast", row.id, null, row);
      return row;
    });
  });
  app.post("/admin/broadcasts/:id/:action", async (req) => {
    const s = await staff(req, managers);
    const p = z
      .object({ id, action: z.enum(["confirm", "cancel", "test"]) })
      .parse(req.params);
    return atomic(async (tx) => {
      const b = await tx.broadcast.findUniqueOrThrow({ where: { id: p.id } });
      requireThat(
        s.role === "SUPER_ADMIN" ||
          s.branchAccess.some((x) => x.branchId === b.audienceBranchId),
        "Filialga ruxsat yo‘q",
        403,
      );
      if (p.action === "test") {
        await tx.outbox.create({
          data: {
            key: `test:${b.id}:${Date.now()}`,
            telegramId: String(s.telegramUserId),
            text: `[TEST] ${b.bodyUz}`,
            imageUrl: b.imageUrl,
            buttonLabel: b.buttonLabel,
            buttonUrl: b.buttonUrl,
          },
        });
      }
      if (p.action === "confirm") {
        requireThat(b.status === "DRAFT", "Xabar allaqachon tasdiqlangan", 409);
        await tx.broadcast.update({
          where: { id: b.id },
          data: {
            status: "SCHEDULED",
            scheduledAt: b.scheduledAt ?? new Date(),
          },
        });
      }
      if (p.action === "cancel") {
        await tx.broadcast.update({
          where: { id: b.id },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        await tx.outbox.updateMany({
          where: { broadcastId: b.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
      }
      await audit(
        tx,
        s.id,
        `BROADCAST_${p.action.toUpperCase()}`,
        "Broadcast",
        b.id,
        b,
        { action: p.action },
      );
      return { ok: true };
    });
  });
}
