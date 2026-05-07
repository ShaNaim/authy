import { Request, Response, NextFunction } from "express";
import { notificationService } from "@/services/notification.service";
import { sendSuccess, sendNoContent, sendPaginated } from "@/utils/response.utils";
import { NotificationEventType } from "@prisma/client";
export const notificationController = {
  // ── Notification inbox ────────────────────────────────────────────────────

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = "1", limit = "20", unreadOnly } = req.query as Record<string, string>;
      const result = await notificationService.listNotifications(req.user!.userId, {
        page: Number(page),
        limit: Math.min(Number(limit), 100),
        unreadOnly: unreadOnly === "true",
      });
      sendPaginated(res, result.notifications, result.total, Number(page), Math.min(Number(limit), 100), req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const count = await notificationService.getUnreadCount(req.user!.userId);
      sendSuccess(res, { unreadCount: count }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationService.markRead(req.params["id"]!, req.user!.userId);
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },

  async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationService.markAllRead(req.user!.userId);
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async listSubs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const subs = await notificationService.listSubs(req.user!.userId);
      sendSuccess(res, { subscriptions: subs }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async createSub(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { eventType, appId } = req.body as { eventType: NotificationEventType; appId?: string };
      const sub = await notificationService.createSub(req.user!.userId, eventType, appId);
      sendSuccess(res, { subscription: sub }, 201, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async deleteSub(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationService.deleteSub(req.params["id"]!, req.user!.userId);
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },
};
