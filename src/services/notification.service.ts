import { NotificationEventType, Prisma } from "@prisma/client";
import { notificationRepository } from "@/repositories/notification.repository";
import { userRepository } from "@/repositories/user.repository";
import { enqueueEmail, EMAIL_JOB_TYPES } from "@/services/queue.service";
import logger from "@/utils/base.logger";

export class NotificationService {
  // ── Dispatch ───────────────────────────────────────────────────────────────
  // Creates in-app notifications for all subscribed admins and queues emails.

  async dispatch(
    eventType: NotificationEventType,
    appId: string | undefined,
    title: string,
    body: string,
    metadata?: Prisma.InputJsonValue
  ): Promise<void> {
    try {
      const adminIds = await notificationRepository.findSubscribedAdminIds(eventType, appId);
      if (adminIds.length === 0) return;

      await notificationRepository.createMany(
        adminIds.map((adminId) => ({ adminId, eventType, appId, title, body, metadata }))
      );

      // Fire-and-forget email notifications
      for (const adminId of adminIds) {
        void this.sendEmailToAdmin(adminId, title, body);
      }
    } catch (err) {
      logger.error("Failed to dispatch notification", { eventType, appId, err });
    }
  }

  private async sendEmailToAdmin(adminId: string, title: string, body: string): Promise<void> {
    try {
      const user = await userRepository.findById(adminId);
      if (!user) return;
      void enqueueEmail({
        type: EMAIL_JOB_TYPES.SEND_ADMIN_NOTIFICATION,
        to: user.email,
        title,
        body,
        userName: user.firstName ?? undefined,
      });
    } catch (err) {
      logger.warn("Failed to queue admin notification email", { adminId, err });
    }
  }

  // ── Subscription management ────────────────────────────────────────────────

  async createSub(
    adminId: string,
    eventType: NotificationEventType,
    appId?: string
  ) {
    return notificationRepository.createSub(adminId, eventType, appId);
  }

  async deleteSub(id: string, adminId: string): Promise<void> {
    return notificationRepository.deleteSub(id, adminId);
  }

  async listSubs(adminId: string) {
    return notificationRepository.listSubs(adminId);
  }

  // ── Notification inbox ────────────────────────────────────────────────────

  async listNotifications(
    adminId: string,
    options: { page: number; limit: number; unreadOnly?: boolean }
  ) {
    return notificationRepository.listNotifications(adminId, options);
  }

  async markRead(id: string, adminId: string): Promise<void> {
    return notificationRepository.markRead(id, adminId);
  }

  async markAllRead(adminId: string): Promise<void> {
    return notificationRepository.markAllRead(adminId);
  }

  async getUnreadCount(adminId: string): Promise<number> {
    return notificationRepository.getUnreadCount(adminId);
  }
}

export const notificationService = new NotificationService();
