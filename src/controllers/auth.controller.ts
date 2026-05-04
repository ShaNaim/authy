import { Request, Response, NextFunction } from "express";
import { authService } from "@/services/auth.service";
import { sendSuccess, sendCreated } from "@/utils/response.utils";
import { ValidationError } from "@/utils/errors";
import { AccessTokenPayload } from "@/types";

function getMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    requestId: req.requestId,
  };
}

export const authController = {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body, getMeta(req));
      sendCreated(res, result, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body, getMeta(req));
      sendSuccess(res, result, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async refreshTokens(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body as { refreshToken: string };
      const tokens = await authService.refreshTokens(refreshToken, getMeta(req));
      sendSuccess(res, { tokens }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.query as { token: string };
      if (!token) throw new ValidationError("Verification token is required");
      const result = await authService.verifyEmail(token, getMeta(req));
      sendSuccess(res, result, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async resendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body as { email: string };
      const result = await authService.resendVerificationEmail(email, getMeta(req));
      sendSuccess(res, result, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body as { email: string };
      const result = await authService.forgotPassword(email, getMeta(req));
      sendSuccess(res, result, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = req.body as { token: string; newPassword: string };
      const result = await authService.resetPassword(token, newPassword, getMeta(req));
      sendSuccess(res, result, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getMe(req.user!.userId);
      sendSuccess(res, { user }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.updateMe(req.user!.userId, req.body, getMeta(req));
      sendSuccess(res, { user }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body as { refreshToken: string };
      if (!refreshToken) throw new ValidationError("Refresh token is required");

      const { jti, exp } = req.user as AccessTokenPayload;
      await authService.logout(req.user!.userId, jti, exp!, refreshToken, getMeta(req));
      sendSuccess(res, { message: "Logged out successfully" }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jti, exp } = req.user as AccessTokenPayload;
      await authService.logoutAll(req.user!.userId, jti, exp!, getMeta(req));
      sendSuccess(res, { message: "Logged out from all devices" }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };
      const result = await authService.changePassword(req.user!.userId, currentPassword, newPassword, getMeta(req));
      sendSuccess(res, result, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },
};
