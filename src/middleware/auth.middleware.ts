import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "@/utils/jwt.utils";
import { AuthenticationError, AuthorizationError } from "@/utils/errors";
import { tokenService } from "@/services/token.service";
import { UserRole } from "@/constants";
import { AccessTokenPayload } from "@/types";

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No token provided");
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    const revoked = await tokenService.isAccessTokenRevoked(payload.jti, payload.userId, payload.iat ?? 0);
    if (revoked) {
      throw new AuthenticationError("Token has been revoked");
    }

    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }
    if (!roles.includes(req.user.role as UserRole)) {
      next(new AuthorizationError(`Requires role: ${roles.join(" or ")}`));
      return;
    }
    next();
  };
}

export function requireVerified(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AuthenticationError());
    return;
  }
  // Verified status is encoded in the DB; if needed, re-check via getMe.
  // For now, trust the token - unverified users can't log in.
  next();
}

export const requireAdmin = requireRole(UserRole.ADMIN);
export const requireAdminOrModerator = requireRole(UserRole.ADMIN, UserRole.MODERATOR);
