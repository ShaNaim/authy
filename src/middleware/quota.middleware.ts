import { Request, Response, NextFunction } from "express";
import { OrgPlan } from "@prisma/client";
import { cacheService } from "@/services/cache.service";
import { orgRepository } from "@/repositories/org.repository";
import { PLAN_LIMITS, QUOTA_ERROR_CODE } from "@/constants/plans.constants";
import { HTTP_STATUS } from "@/constants";
import { sendError } from "@/utils/response.utils";
import logger from "@/utils/base.logger";

function getOrgId(req: Request): string | null {
  // Prefer org from API key auth, fall back to JWT org
  if (req.orgFromKey) return req.orgFromKey.id;
  if (req.user?.orgId) return req.user.orgId;
  return null;
}

/**
 * Enforces per-org daily API call quota.
 * Attaches after authenticateOrgApiKey or authenticate.
 * Returns 429 with PLAN_LIMIT_EXCEEDED if over limit.
 */
export async function enforceApiCallQuota(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const orgId = getOrgId(req);
  if (!orgId) {
    next();
    return;
  }

  try {
    const org = req.orgFromKey ?? (await orgRepository.findById(orgId));
    if (!org) {
      next();
      return;
    }

    const limits = PLAN_LIMITS[org.plan as OrgPlan];
    const current = await cacheService.getApiCallsToday(orgId);

    if (current >= limits.maxApiCallsPerDay) {
      sendError(
        res,
        HTTP_STATUS.TOO_MANY_REQUESTS,
        QUOTA_ERROR_CODE,
        `Daily API call limit of ${limits.maxApiCallsPerDay.toLocaleString()} reached for your plan. Upgrade to continue.`,
        { limit: limits.maxApiCallsPerDay, current, plan: org.plan },
        req.requestId
      );
      return;
    }

    // Increment in the background — don't block the request
    cacheService.incrementApiCalls(orgId).catch((err) =>
      logger.warn("Failed to increment API call counter", { orgId, err })
    );

    next();
  } catch (err) {
    // Quota failure should never block legitimate traffic
    logger.error("Quota middleware error", { err });
    next();
  }
}
