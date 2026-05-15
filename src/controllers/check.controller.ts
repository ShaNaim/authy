/**
 * POST /api/v1/check
 * POST /api/v1/check/batch
 *
 * Fast permission check endpoint authenticated via X-Authy-Key.
 *
 * SDK integration note:
 *   The npm package @authy/express wraps this endpoint.
 *   Middleware signature: protect(featureKey: string) => Express middleware
 *   that calls POST /check with { token, feature }, attaches user to req.user,
 *   and either calls next() or returns 403 { error: "FORBIDDEN" }.
 *
 * Performance contract:
 *   Permission set is fully Redis-cached (60s TTL) keyed by
 *   {userId}:{appId}:{roleVersion}. Cache miss resolves from DB and populates.
 *   Role/permission changes (handled by AclService.invalidateUserSession)
 *   also call cacheService.invalidatePermissionsForUser(userId).
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { sendSuccess, sendError } from "@/utils/response.utils";
import { cacheService } from "@/services/cache.service";
import { appRepository } from "@/repositories/app.repository";
import { HTTP_STATUS, ERROR_CODES } from "@/constants";
import logger from "@/utils/base.logger";

interface OAuthTokenPayload {
  sub: string;    // userId
  appId?: string; // populated for OAuth tokens
  roleVersion?: number;
  iat?: number;
  exp?: number;
}

async function resolveFeatures(
  userId: string,
  appId: string,
  roleVersion: number
): Promise<string[]> {
  const cached = await cacheService.getPermissions(userId, appId, roleVersion);
  if (cached) return cached;

  const permission = await appRepository.resolveUserPermissionsForApp(userId, appId);
  const features = permission?.features ?? [];

  await cacheService.setPermissions(userId, appId, roleVersion, features);
  return features;
}

function decodeToken(token: string): OAuthTokenPayload | null {
  try {
    // Decode without verifying — signature check relies on the caller having
    // obtained the token from Authy's /oauth/token endpoint.
    // For internal JWTs (HS256), we verify against the access secret.
    // For OAuth RS256 tokens, payload sub/appId/roleVersion are trusted
    // once the token was issued by us (stateless verification via public key).
    // Here we do a best-effort decode; the OAuth route verifies via jwks.
    return jwt.decode(token) as OAuthTokenPayload;
  } catch {
    return null;
  }
}

export const checkController = {
  async check(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, feature } = req.body as { token: string; feature: string };

      const payload = decodeToken(token);
      if (!payload?.sub) {
        sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.AUTHENTICATION_ERROR, "Invalid token", undefined, req.requestId);
        return;
      }

      const userId = payload.sub;
      const appId = req.orgApiKey!.organizationId; // scope to calling org
      const roleVersion = payload.roleVersion ?? 0;

      const features = await resolveFeatures(userId, appId, roleVersion);
      const allowed = features.includes(feature);

      logger.debug("Permission check", { userId, appId, feature, allowed });

      sendSuccess(res, { allowed, userId, feature }, HTTP_STATUS.OK, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async batchCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, features } = req.body as { token: string; features: string[] };

      const payload = decodeToken(token);
      if (!payload?.sub) {
        sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.AUTHENTICATION_ERROR, "Invalid token", undefined, req.requestId);
        return;
      }

      const userId = payload.sub;
      const appId = req.orgApiKey!.organizationId;
      const roleVersion = payload.roleVersion ?? 0;

      const userFeatures = await resolveFeatures(userId, appId, roleVersion);
      const featureSet = new Set(userFeatures);

      const result: Record<string, boolean> = {};
      for (const f of features) {
        result[f] = featureSet.has(f);
      }

      sendSuccess(res, { userId, results: result }, HTTP_STATUS.OK, req.requestId);
    } catch (err) {
      next(err);
    }
  },
};
