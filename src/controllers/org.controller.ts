import { Request, Response, NextFunction } from "express";
import { OrgMemberRole, OrgStatus, Organization } from "@prisma/client";
import { sendSuccess, sendCreated, sendNoContent, sendPaginated } from "@/utils/response.utils";
import { orgService } from "@/services/org.service";

function getMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    requestId: req.requestId,
  };
}

// ── Admin: org management (global admin only) ─────────────────────────────────

export const adminOrgController = {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await orgService.createOrg(req.body, req.user!.userId, getMeta(req));
      sendCreated(res, result, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = "1", limit = "20", status } = req.query as Record<string, string>;
      const { orgs, total } = await orgService.listOrgs({
        page: Number(page),
        limit: Math.min(Number(limit), 100),
        status: status as OrgStatus | undefined,
      });
      sendPaginated(res, orgs, total, Number(page), Math.min(Number(limit), 100), req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const org = await orgService.getOrg(req.params["orgId"]!);
      sendSuccess(res, { org }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const org = await orgService.updateOrg(req.params["orgId"]!, req.body, req.user!.userId, getMeta(req));
      sendSuccess(res, { org }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async suspend(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await orgService.suspendOrg(req.params["orgId"]!, req.user!.userId, getMeta(req));
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },

  async reactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await orgService.reactivateOrg(req.params["orgId"]!, req.user!.userId, getMeta(req));
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },

  async regenerateSecret(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { secret } = await orgService.regenerateSecret(req.params["orgId"]!, req.user!.userId, getMeta(req));
      sendSuccess(res, { secret }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const member = await orgService.addMember(req.params["orgId"]!, req.body.userId, req.body.role ?? OrgMemberRole.ADMIN, req.user!.userId, getMeta(req));
      sendCreated(res, { member }, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async listMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const members = await orgService.listMembers(req.params["orgId"]!);
      sendSuccess(res, { members }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await orgService.removeMember(req.params["orgId"]!, req.params["userId"]!, req.user!.userId, getMeta(req));
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },

  async listApps(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = "1", limit = "20" } = req.query as Record<string, string>;
      const { apps, total } = await orgService.listOrgApps(req.params["orgId"]!, {
        page: Number(page),
        limit: Math.min(Number(limit), 100),
      });
      sendPaginated(res, apps, total, Number(page), Math.min(Number(limit), 100), req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = "1", limit = "20", search } = req.query as Record<string, string>;
      const { users, total } = await orgService.listOrgUsers(req.params["orgId"]!, {
        page: Number(page),
        limit: Math.min(Number(limit), 100),
        search,
      });
      sendPaginated(res, users, total, Number(page), Math.min(Number(limit), 100), req.requestId);
    } catch (err) {
      next(err);
    }
  },
};

// ── Org admin: self-service routes (org owner/admin only) ─────────────────────

export const orgAdminController = {
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const org = await orgService.getMyOrg(req.user!.orgId);
      sendSuccess(res, { org }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const org = await orgService.updateMyOrg(req.user!.orgId, req.body, req.user!.userId, getMeta(req));
      sendSuccess(res, { org }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async listMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const members = await orgService.listMembers(req.user!.orgId);
      sendSuccess(res, { members }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async listApps(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = "1", limit = "20" } = req.query as Record<string, string>;
      const { apps, total } = await orgService.listOrgApps(req.user!.orgId, {
        page: Number(page),
        limit: Math.min(Number(limit), 100),
      });
      sendPaginated(res, apps, total, Number(page), Math.min(Number(limit), 100), req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = "1", limit = "20", search } = req.query as Record<string, string>;
      const { users, total } = await orgService.listOrgUsers(req.user!.orgId, {
        page: Number(page),
        limit: Math.min(Number(limit), 100),
        search,
      });
      sendPaginated(res, users, total, Number(page), Math.min(Number(limit), 100), req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async getUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await orgService.getUsageStats(req.user!.orgId);
      sendSuccess(res, stats, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },
};

// ── Public Org API: end-user registration/login ────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      org?: Organization;
    }
  }
}

export const orgApiController = {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await orgService.orgRegisterUser(req.org!, req.body, getMeta(req));
      sendCreated(res, result, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await orgService.orgLoginUser(req.org!, req.body, getMeta(req));
      sendSuccess(res, result, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },
};
