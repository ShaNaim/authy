import { Request, Response, NextFunction } from "express";
import { WebhookEventType } from "@prisma/client";
import { sendSuccess, sendCreated, sendNoContent } from "@/utils/response.utils";
import { webhookService } from "@/services/webhook.service";

function getMeta(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers["user-agent"], requestId: req.requestId };
}

export const webhookController = {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { url, events } = req.body as { url: string; events: WebhookEventType[] };
      const webhook = await webhookService.create(req.user!.orgId, { url, events }, req.user!.userId, getMeta(req));
      sendCreated(res, { webhook }, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const webhooks = await webhookService.list(req.user!.orgId);
      // Never expose secret in list response
      const safe = webhooks.map(({ secret: _, ...wh }) => wh);
      sendSuccess(res, { webhooks: safe }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const wh = await webhookService.get(req.params["webhookId"]!, req.user!.orgId);
      const { secret: _, ...safe } = wh;
      sendSuccess(res, { webhook: safe }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await webhookService.update(req.params["webhookId"]!, req.user!.orgId, req.body, req.user!.userId, getMeta(req));
      const { secret: _, ...safe } = updated;
      sendSuccess(res, { webhook: safe }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await webhookService.delete(req.params["webhookId"]!, req.user!.orgId, req.user!.userId, getMeta(req));
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },

  async listDeliveries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deliveries = await webhookService.listDeliveries(req.params["webhookId"]!, req.user!.orgId);
      sendSuccess(res, { deliveries }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async sendTest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await webhookService.sendTest(req.params["webhookId"]!, req.user!.orgId, req.user!.userId);
      sendSuccess(res, { message: "Test delivery enqueued" }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },
};
