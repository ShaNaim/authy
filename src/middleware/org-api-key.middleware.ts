import { Request, Response, NextFunction } from "express";
import { OrgApiKey, Organization } from "@prisma/client";
import { orgApiKeyService } from "@/services/org-api-key.service";
import { orgRepository } from "@/repositories/org.repository";
import { AuthenticationError, AuthorizationError } from "@/utils/errors";
import { OrgStatus } from "@/constants";

declare global {
  namespace Express {
    interface Request {
      orgApiKey?: OrgApiKey;
      orgFromKey?: Organization;
    }
  }
}

/**
 * Authenticates requests via X-Authy-Key header.
 * Populates req.orgApiKey and req.orgFromKey.
 * Used on /api/v1/check and /api/v1/check/batch.
 */
export async function authenticateOrgApiKey(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawKey = req.headers["x-authy-key"];
    if (!rawKey || typeof rawKey !== "string") {
      throw new AuthenticationError("X-Authy-Key header is required");
    }

    const key = await orgApiKeyService.authenticateKey(rawKey);
    if (!key) throw new AuthenticationError("Invalid or expired API key");

    const org = await orgRepository.findById(key.organizationId);
    if (!org) throw new AuthenticationError("Organization not found");
    if (org.status === OrgStatus.SUSPENDED) {
      throw new AuthorizationError("Organization is suspended");
    }

    req.orgApiKey = key;
    req.orgFromKey = org;
    next();
  } catch (err) {
    next(err);
  }
}
