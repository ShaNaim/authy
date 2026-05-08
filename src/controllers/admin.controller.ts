import { Request, Response, NextFunction } from "express";
import { authService } from "@/services/auth.service";
import { auditService } from "@/services/audit.service";
import { sendSuccess, sendNoContent, sendPaginated } from "@/utils/response.utils";
import { UserRole } from "@/constants";

function getMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    requestId: req.requestId,
  };
}

export const adminController = {
  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = "1", limit = "20", role, isActive, isVerified, search } = req.query as Record<string, string>;
      const options = {
        page: Number(page),
        limit: Math.min(Number(limit), 100),
        role: role as UserRole | undefined,
        isActive: isActive !== undefined ? isActive === "true" : undefined,
        isVerified: isVerified !== undefined ? isVerified === "true" : undefined,
        search: search || undefined,
      };
      const { users, total } = await authService.listUsers(options);
      sendPaginated(res, users, total, options.page, options.limit, req.requestId);
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

  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.updateUser(req.params["id"]!, req.user!.userId, req.body, getMeta(req));
      sendSuccess(res, { user }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async suspendUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.suspendUser(req.params["id"]!, req.user!.userId, getMeta(req));
      sendSuccess(res, { user }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async activateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.activateUser(req.params["id"]!, req.user!.userId, getMeta(req));
      sendSuccess(res, { user }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async forceActivateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.forceActivateUser(req.params["id"]!, req.user!.userId, req.body.adminPassword, getMeta(req));
      sendSuccess(res, { user }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.deleteUser(req.params["id"]!, req.user!.userId, getMeta(req));
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },

  async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = "1", limit = "20", action, userId, from, to } = req.query as Record<string, string>;
      const options = {
        page: Number(page),
        limit: Math.min(Number(limit), 100),
        action,
        userId,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      };
      const { logs, total } = await auditService.getAllLogs(options);
      sendPaginated(res, logs, total, options.page, options.limit, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async getUserAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = "1", limit = "20" } = req.query as Record<string, string>;
      const { logs, total } = await auditService.getUserLogs(req.params["id"]!, Number(page), Number(limit));
      sendPaginated(res, logs, total, Number(page), Number(limit), req.requestId);
    } catch (err) {
      next(err);
    }
  },
};
