import { Request, Response, NextFunction } from "express";
import { authService } from "@/services/auth.service";
import { env } from "@/config/env";
import { sendSuccess } from "@/utils/response.utils";
import { AuthenticationError } from "@/utils/errors";

export function internalApiKeyGuard(req: Request, _res: Response, next: NextFunction): void {
  const apiKey = req.headers["x-internal-api-key"];
  if (!env.INTERNAL_API_KEY || apiKey !== env.INTERNAL_API_KEY) {
    next(new AuthenticationError("Invalid or missing internal API key"));
    return;
  }
  next();
}

export const internalController = {
  async verifyToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.body as { token?: string };
      if (!token) {
        sendSuccess(res, { valid: false, user: null }, 200, req.requestId);
        return;
      }
      const user = await authService.verifyTokenInternal(token);
      sendSuccess(res, { valid: user !== null, user }, 200, req.requestId);
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
};
