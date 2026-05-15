import { getPrismaClient } from "@/config/database";
import { DatabaseError } from "@/utils/errors";

export interface DashboardStats {
  users: {
    total: number;
    active: number;
    verified: number;
    suspended: number;
    newLast7Days: number;
    byRole: Record<string, number>;
  };
  apps: {
    total: number;
    active: number;
    suspended: number;
  };
  organizations: {
    total: number;
    active: number;
    suspended: number;
    byAuthMode: Record<string, number>;
  };
  syncRequests: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
  notifications: {
    unread: number;
  };
  activityLast7Days: {
    dates: string[];
    series: Array<{ action: string; counts: number[] }>;
  };
}

export const statsService = {
  async getDashboardStats(adminId: string): Promise<DashboardStats> {
    const prisma = getPrismaClient();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      const [
        totalUsers,
        activeUsers,
        verifiedUsers,
        suspendedUsers,
        newUsers,
        usersByRole,
        totalApps,
        activeApps,
        suspendedApps,
        totalOrgs,
        activeOrgs,
        suspendedOrgs,
        orgsByAuthMode,
        pendingSync,
        approvedSync,
        rejectedSync,
        unreadNotif,
        recentLogs,
      ] = await prisma.$transaction([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.user.count({ where: { isVerified: true } }),
        prisma.user.count({ where: { isActive: false } }),
        prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.user.groupBy({ by: ["role"], _count: { _all: true }, orderBy: { _count: { role: "desc" } } }),
        prisma.app.count(),
        prisma.app.count({ where: { status: "ACTIVE" } }),
        prisma.app.count({ where: { status: "SUSPENDED" } }),
        prisma.organization.count(),
        prisma.organization.count({ where: { status: "ACTIVE" } }),
        prisma.organization.count({ where: { status: "SUSPENDED" } }),
        prisma.organization.groupBy({ by: ["authMode"], _count: { _all: true }, orderBy: { authMode: "asc" } }),
        prisma.featureSyncRequest.count({ where: { status: "PENDING" } }),
        prisma.featureSyncRequest.count({ where: { status: "APPROVED" } }),
        prisma.featureSyncRequest.count({ where: { status: "REJECTED" } }),
        prisma.notification.count({ where: { adminId, isRead: false } }),
        prisma.auditLog.findMany({
          where: { createdAt: { gte: sevenDaysAgo } },
          select: { createdAt: true, action: true },
        }),
      ]);

      const byRole: Record<string, number> = {};
      for (const row of usersByRole) {
        const cnt = typeof row._count === "object" ? row._count._all : 0;
        byRole[row.role] = cnt ?? 0;
      }

      const byAuthMode: Record<string, number> = {};
      for (const row of orgsByAuthMode) {
        const cnt = typeof row._count === "object" ? row._count._all : 0;
        byAuthMode[row.authMode] = cnt ?? 0;
      }

      // Build date window (oldest → today)
      const dates: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split("T")[0]!);
      }

      // Group counts by action → date
      const byActionDate: Record<string, Record<string, number>> = {};
      for (const log of recentLogs) {
        const day = log.createdAt.toISOString().split("T")[0]!;
        if (!byActionDate[log.action]) byActionDate[log.action] = {};
        byActionDate[log.action]![day] = (byActionDate[log.action]![day] ?? 0) + 1;
      }

      // Pick top 6 actions by total volume, build aligned count arrays
      const topActions = Object.entries(byActionDate)
        .map(([action, byDay]) => ({
          action,
          total: Object.values(byDay).reduce((a, b) => a + b, 0),
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 6)
        .map(({ action }) => action);

      const activityLast7Days = {
        dates,
        series: topActions.map((action) => ({
          action,
          counts: dates.map((d) => byActionDate[action]?.[d] ?? 0),
        })),
      };

      return {
        users: {
          total: totalUsers,
          active: activeUsers,
          verified: verifiedUsers,
          suspended: suspendedUsers,
          newLast7Days: newUsers,
          byRole,
        },
        apps: {
          total: totalApps,
          active: activeApps,
          suspended: suspendedApps,
        },
        organizations: {
          total: totalOrgs,
          active: activeOrgs,
          suspended: suspendedOrgs,
          byAuthMode,
        },
        syncRequests: {
          pending: pendingSync,
          approved: approvedSync,
          rejected: rejectedSync,
          total: pendingSync + approvedSync + rejectedSync,
        },
        notifications: {
          unread: unreadNotif,
        },
        activityLast7Days,
      };
    } catch {
      throw new DatabaseError("Failed to fetch dashboard stats");
    }
  },
};
