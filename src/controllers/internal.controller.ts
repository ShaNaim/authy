import { Request, Response, NextFunction } from "express";
import { authService } from "@/services/auth.service";
import { aclService } from "@/services/acl.service";
import { appRepository } from "@/repositories/app.repository";
import { env } from "@/config/env";
import { sendSuccess } from "@/utils/response.utils";
import { AuthenticationError, ValidationError } from "@/utils/errors";
import { hashToken } from "@/utils/token.utils";
import { verifyAccessToken } from "@/utils/jwt.utils";
import { AccessTokenPayload } from "@/types";

export function internalApiKeyGuard(req: Request, _res: Response, next: NextFunction): void {
  const apiKey = req.headers["x-internal-api-key"];
  if (!env.INTERNAL_API_KEY || apiKey !== env.INTERNAL_API_KEY) {
    next(new AuthenticationError("Invalid or missing internal API key"));
    return;
  }
  next();
}

// Middleware for app-secret-authenticated internal routes
export async function appSecretGuard(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const rawSecret = req.headers["x-app-secret"] as string | undefined;
    if (!rawSecret) {
      throw new AuthenticationError("Missing X-App-Secret header");
    }
    const secretHash = hashToken(rawSecret);
    const app = await appRepository.findActiveAppBySecretHash(secretHash);
    if (!app) {
      throw new AuthenticationError("Invalid app secret or app is not active");
    }
    (req as any).clientApp = app;
    next();
  } catch (err) {
    next(err);
  }
}

export const internalController = {
  // Verify a user access token. If X-App-Secret is provided, returns app-specific permissions.
  async verifyToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.body as { token?: string };
      if (!token) {
        sendSuccess(res, { valid: false, user: null }, 200, req.requestId);
        return;
      }

      const user = await authService.verifyTokenInternal(token);
      if (!user) {
        sendSuccess(res, { valid: false, user: null }, 200, req.requestId);
        return;
      }

      // If caller provided an app secret alongside the global key, return app-scoped permissions
      const rawAppSecret = req.headers["x-app-secret"] as string | undefined;
      if (rawAppSecret) {
        const secretHash = hashToken(rawAppSecret);
        const app = await appRepository.findActiveAppBySecretHash(secretHash);
        if (app) {
          // Decode JWT to get cached permission snapshot for stale-check
          let jwtPayload: AccessTokenPayload | null = null;
          try {
            jwtPayload = verifyAccessToken(token);
          } catch {}

          const jwtAppPerm = jwtPayload?.appPermissions?.[app.id];
          const { permission, permissionsStale } = await aclService.getUserPermissionsForApp(
            user.id,
            app.id,
            jwtAppPerm ? { roleVersion: jwtAppPerm.roleVersion } : undefined
          );

          sendSuccess(res, {
            valid: true,
            user,
            appPermission: permission,
            permissionsStale,
          }, 200, req.requestId);
          return;
        }
      }

      sendSuccess(res, { valid: true, user }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getUser(req.params["id"]!);
      sendSuccess(res, { user }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  // App-authenticated: sync this app's feature list (creates a pending sync request)
  async syncFeatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const app = (req as any).clientApp;
      const { features } = req.body as { features: { key: string; displayName: string; description?: string }[] };

      if (!features || features.length === 0) {
        throw new ValidationError("Feature list cannot be empty");
      }

      // Use app secret from header directly to route through the service
      const rawSecret = req.headers["x-app-secret"] as string;
      const request = await aclService.submitFeatureSync(rawSecret, features);

      sendSuccess(res, {
        message: "Feature sync submitted for admin review",
        requestId: request.id,
        appId: app.id,
        featureCount: features.length,
      }, 201, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  // App-authenticated: get this app's features for a specific user
  async getUserPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const app = (req as any).clientApp;
      const userId = req.params["userId"]!;

      const permission = await appRepository.resolveUserPermissionsForApp(userId, app.id);

      sendSuccess(res, {
        userId,
        appId: app.id,
        permission: permission ?? null,
        hasAccess: permission !== null,
      }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },
};
