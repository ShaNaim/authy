import {
  PrismaClient,
  AdminNotificationSub,
  Notification,
  NotificationEventType,
  Prisma,
} from "@prisma/client";
import { getPrismaClient } from "@/config/database";
import { DatabaseError } from "@/utils/errors";

export const GLOBAL_SCOPE = "GLOBAL";

export class NotificationRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async createSub(
    adminId: string,
    eventType: NotificationEventType,
    appId?: string
  ): Promise<AdminNotificationSub> {
    const scope = appId ?? GLOBAL_SCOPE;
    const existing = await this.prisma.adminNotificationSub.findFirst({
      where: { adminId, eventType, scope },
    });
    if (existing) {
      throw new DatabaseError("Subscription already exists");
    }
    try {
      return await this.prisma.adminNotificationSub.create({
        data: { adminId, eventType, scope, appId },
      });
    } catch {
      throw new DatabaseError("Failed to create notification subscription");
    }
  }

  async deleteSub(id: string, adminId: string): Promise<void> {
    try {
      await this.prisma.adminNotificationSub.deleteMany({ where: { id, adminId } });
    } catch {
      throw new DatabaseError("Failed to delete subscription");
    }
  }

  async listSubs(adminId: string): Promise<AdminNotificationSub[]> {
    try {
      return await this.prisma.adminNotificationSub.findMany({
        where: { adminId },
        orderBy: { createdAt: "desc" },
      });
    } catch {
      throw new DatabaseError("Failed to list subscriptions");
    }
  }

  async bulkCreateSubs(
    adminIds: string[],
    eventType: NotificationEventType,
    appId?: string
  ): Promise<{ created: number; skipped: number }> {
    const scope = appId ?? GLOBAL_SCOPE;
    try {
      const existing = await this.prisma.adminNotificationSub.findMany({
        where: { eventType, scope, adminId: { in: adminIds } },
        select: { adminId: true },
      });
      const existingSet = new Set(existing.map((s) => s.adminId));
      const toCreate = adminIds.filter((id) => !existingSet.has(id));

      if (toCreate.length > 0) {
        await this.prisma.adminNotificationSub.createMany({
          data: toCreate.map((adminId) => ({ adminId, eventType, scope, appId })),
        });
      }
      return { created: toCreate.length, skipped: existingSet.size };
    } catch {
      throw new DatabaseError("Failed to bulk create notification subscriptions");
    }
  }

  async findSubscribedAdminIds(
    eventType: NotificationEventType,
    appId?: string
  ): Promise<string[]> {
    try {
      const scopes = [GLOBAL_SCOPE];
      if (appId) scopes.push(appId);

      const subs = await this.prisma.adminNotificationSub.findMany({
        where: { eventType, scope: { in: scopes } },
        select: { adminId: true },
        distinct: ["adminId"],
      });
      return subs.map((s) => s.adminId);
    } catch {
      throw new DatabaseError("Failed to find subscribed admins");
    }
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  async createMany(
    entries: {
      adminId: string;
      eventType: NotificationEventType;
      appId?: string;
      title: string;
      body: string;
      metadata?: Prisma.InputJsonValue;
    }[]
  ): Promise<void> {
    if (entries.length === 0) return;
    try {
      await this.prisma.notification.createMany({ data: entries });
    } catch {
      throw new DatabaseError("Failed to create notifications");
    }
  }

  async listNotifications(
    adminId: string,
    options: { page: number; limit: number; unreadOnly?: boolean }
  ): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    const skip = (options.page - 1) * options.limit;
    const where: Prisma.NotificationWhereInput = { adminId };
    if (options.unreadOnly) where.isRead = false;
    try {
      const [notifications, total, unreadCount] = await this.prisma.$transaction([
        this.prisma.notification.findMany({
          where,
          skip,
          take: options.limit,
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.notification.count({ where }),
        this.prisma.notification.count({ where: { adminId, isRead: false } }),
      ]);
      return { notifications, total, unreadCount };
    } catch {
      throw new DatabaseError("Failed to list notifications");
    }
  }

  async markRead(id: string, adminId: string): Promise<void> {
    try {
      await this.prisma.notification.updateMany({ where: { id, adminId }, data: { isRead: true } });
    } catch {
      throw new DatabaseError("Failed to mark notification as read");
    }
  }

  async markAllRead(adminId: string): Promise<void> {
    try {
      await this.prisma.notification.updateMany({ where: { adminId, isRead: false }, data: { isRead: true } });
    } catch {
      throw new DatabaseError("Failed to mark all notifications as read");
    }
  }

  async getUnreadCount(adminId: string): Promise<number> {
    try {
      return await this.prisma.notification.count({ where: { adminId, isRead: false } });
    } catch {
      throw new DatabaseError("Failed to get unread count");
    }
  }
}

export const notificationRepository = new NotificationRepository();
