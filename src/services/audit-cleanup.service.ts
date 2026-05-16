import { OrgPlan } from "@prisma/client";
import { getPrismaClient } from "@/config/database";
import { PLAN_LIMITS } from "@/constants/plans.constants";
import logger from "@/utils/base.logger";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function runAuditLogCleanup(): Promise<void> {
  const prisma = getPrismaClient();
  let totalDeleted = 0;

  // Delete logs for users in each plan tier beyond that tier's retention window.
  // Two-step approach: Prisma's deleteMany cannot traverse two relation hops
  // (AuditLog → user → organization.plan) in a single where clause.
  for (const plan of Object.values(OrgPlan)) {
    const { logRetentionDays } = PLAN_LIMITS[plan];
    const cutoff = new Date(Date.now() - logRetentionDays * ONE_DAY_MS);

    try {
      const users = await prisma.user.findMany({
        where: { organization: { plan } },
        select: { id: true },
      });

      if (users.length === 0) continue;

      const userIds = users.map((u) => u.id);
      const { count } = await prisma.auditLog.deleteMany({
        where: {
          createdAt: { lt: cutoff },
          userId: { in: userIds },
        },
      });
      totalDeleted += count;
    } catch (err) {
      logger.warn(`Audit log cleanup failed for plan ${plan}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Delete orphaned logs (null userId) beyond the maximum retention period (ENTERPRISE = 365 days).
  const systemCutoff = new Date(
    Date.now() - PLAN_LIMITS[OrgPlan.ENTERPRISE].logRetentionDays * ONE_DAY_MS
  );
  try {
    const { count } = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: systemCutoff }, userId: null },
    });
    totalDeleted += count;
  } catch (err) {
    logger.warn("Audit log cleanup failed for orphaned logs", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (totalDeleted > 0) {
    logger.info("Audit log cleanup completed", { deletedCount: totalDeleted });
  }
}

export function startAuditLogCleanup(): void {
  const run = () =>
    void runAuditLogCleanup().catch((err) => {
      logger.warn("Audit log cleanup failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

  run();
  setInterval(run, ONE_DAY_MS);
}
