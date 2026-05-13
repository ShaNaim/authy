import { Request, Response, NextFunction } from "express";
import { aclService } from "@/services/acl.service";
import { sendSuccess, sendCreated, sendNoContent, sendPaginated } from "@/utils/response.utils";
import { AppStatus, SyncRequestStatus } from "@prisma/client";

function getMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    requestId: req.requestId,
  };
}

export const aclController = {
  // ── Apps ──────────────────────────────────────────────────────────────────

  async registerApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await aclService.registerApp(req.body, req.user!.userId, getMeta(req));
      sendCreated(res, result, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async listApps(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = "1", limit = "20", status } = req.query as Record<string, string>;
      const { apps, total } = await aclService.listApps({
        page: Number(page),
        limit: Math.min(Number(limit), 100),
        status: status as AppStatus | undefined,
      });
      sendPaginated(res, apps, total, Number(page), Math.min(Number(limit), 100), req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async getApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const app = await aclService.getApp(req.params["appId"]!);
      sendSuccess(res, { app }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async updateApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const app = await aclService.updateApp(req.params["appId"]!, req.body, req.user!.userId, getMeta(req));
      sendSuccess(res, { app }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async suspendApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const app = await aclService.suspendApp(req.params["appId"]!, req.user!.userId, getMeta(req));
      sendSuccess(res, { app }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async reactivateApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const app = await aclService.reactivateApp(req.params["appId"]!, req.user!.userId, getMeta(req));
      sendSuccess(res, { app }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async regenerateSecret(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await aclService.regenerateAppSecret(req.params["appId"]!, req.user!.userId, getMeta(req));
      sendSuccess(res, result, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  // ── Features ──────────────────────────────────────────────────────────────

  async listFeatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const features = await aclService.listFeatures(req.params["appId"]!);
      sendSuccess(res, { features }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async addFeature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const feature = await aclService.addFeature(req.params["appId"]!, req.body, req.user!.userId, getMeta(req));
      sendCreated(res, { feature }, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async updateFeature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const feature = await aclService.updateFeature(req.params["featureId"]!, req.body, req.user!.userId, getMeta(req));
      sendSuccess(res, { feature }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async removeFeature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await aclService.removeFeature(req.params["featureId"]!, req.user!.userId, getMeta(req));
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },

  // ── Feature Sync Requests ─────────────────────────────────────────────────

  async listSyncRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = "1", limit = "20", appId, status } = req.query as Record<string, string>;
      const { requests, total } = await aclService.listSyncRequests({
        page: Number(page),
        limit: Math.min(Number(limit), 100),
        appId,
        status: status as SyncRequestStatus | undefined,
      });
      sendPaginated(res, requests, total, Number(page), Math.min(Number(limit), 100), req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async approveSyncRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const request = await aclService.approveSyncRequest(req.params["requestId"]!, req.user!.userId, getMeta(req));
      sendSuccess(res, { request }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async rejectSyncRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const request = await aclService.rejectSyncRequest(req.params["requestId"]!, req.user!.userId, getMeta(req));
      sendSuccess(res, { request }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  // ── Roles ─────────────────────────────────────────────────────────────────

  async listRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roles = await aclService.listRoles(req.params["appId"]!);
      sendSuccess(res, { roles }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async createRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const role = await aclService.createRole(req.params["appId"]!, req.body, req.user!.userId, getMeta(req));
      sendCreated(res, { role }, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const role = await aclService.updateRole(req.params["roleId"]!, req.body, req.user!.userId, getMeta(req));
      sendSuccess(res, { role }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async deleteRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await aclService.deleteRole(req.params["roleId"]!, req.user!.userId, getMeta(req));
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },

  async getRoleFeatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const featureIds = await aclService.getRoleFeatures(req.params["roleId"]!);
      sendSuccess(res, { featureIds }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async setRoleFeatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const role = await aclService.setRoleFeatures(req.params["roleId"]!, req.body.featureIds, req.user!.userId, getMeta(req));
      sendSuccess(res, { role }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  // ── User-App Access ───────────────────────────────────────────────────────

  async listAppUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = "1", limit = "20", isActive } = req.query as Record<string, string>;
      const { userApps, total } = await aclService.listAppUsers(req.params["appId"]!, {
        page: Number(page),
        limit: Math.min(Number(limit), 100),
        isActive: isActive !== undefined ? isActive === "true" : undefined,
      });
      sendPaginated(res, userApps, total, Number(page), Math.min(Number(limit), 100), req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async assignUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, roleId } = req.body as { userId: string; roleId?: string };
      const userApp = await aclService.assignUserToApp(userId, req.params["appId"]!, roleId, req.user!.userId, getMeta(req));
      sendCreated(res, { userApp }, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async updateUserAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userApp = await aclService.updateUserAppAccess(
        req.params["userId"]!,
        req.params["appId"]!,
        req.body,
        req.user!.userId,
        getMeta(req)
      );
      sendSuccess(res, { userApp }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async removeUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await aclService.removeUserFromApp(req.params["userId"]!, req.params["appId"]!, req.user!.userId, getMeta(req));
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },

  async setUserFeatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await aclService.setUserDirectFeatures(
        req.params["userId"]!,
        req.params["appId"]!,
        req.body.overrides,
        req.user!.userId,
        getMeta(req)
      );
      sendSuccess(res, { message: "User feature overrides updated" }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },
};
