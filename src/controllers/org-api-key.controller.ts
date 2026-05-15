import { Request, Response, NextFunction } from "express";
import { sendSuccess, sendCreated, sendNoContent } from "@/utils/response.utils";
import { orgApiKeyService } from "@/services/org-api-key.service";

function getMeta(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers["user-agent"], requestId: req.requestId };
}

export const orgApiKeyController = {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, scopes = [], testMode = false, expiresAt } = req.body;
      const result = await orgApiKeyService.create(
        req.user!.orgId,
        { name, scopes, testMode, expiresAt: expiresAt ? new Date(expiresAt) : undefined },
        req.user!.userId,
        getMeta(req)
      );
      sendCreated(res, result, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const keys = await orgApiKeyService.list(req.user!.orgId);
      sendSuccess(res, { apiKeys: keys }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const key = await orgApiKeyService.update(
        req.params["keyId"]!,
        req.user!.orgId,
        req.body,
        req.user!.userId,
        getMeta(req)
      );
      sendSuccess(res, { apiKey: key }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await orgApiKeyService.revoke(
        req.params["keyId"]!,
        req.user!.orgId,
        req.user!.userId,
        getMeta(req)
      );
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },
};
