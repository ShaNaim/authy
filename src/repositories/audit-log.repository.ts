import { AuditLog, Prisma, PrismaClient } from "@prisma/client";
import { getPrismaClient } from "@/config/database";
import { DatabaseError } from "@/utils/errors";

export interface CreateAuditLogData {
  userId?: string | null;
  action: string;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export class AuditLogRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  async create(data: CreateAuditLogData): Promise<AuditLog> {
    try {
      return await this.prisma.auditLog.create({
        data: {
          userId: data.userId ?? undefined,
          action: data.action,
          details: (data.details ?? undefined) as Prisma.InputJsonValue | undefined,
          ipAddress: data.ipAddress ?? undefined,
          userAgent: data.userAgent ?? undefined,
          requestId: data.requestId ?? undefined,
        },
      });
    } catch {
      throw new DatabaseError("Failed to create audit log");
    }
  }

  async findByUserId(
    userId: string,
    options: { page: number; limit: number }
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const skip = (options.page - 1) * options.limit;
    try {
      const [logs, total] = await this.prisma.$transaction([
        this.prisma.auditLog.findMany({
          where: { userId },
          skip,
          take: options.limit,
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.auditLog.count({ where: { userId } }),
      ]);
      return { logs, total };
    } catch {
      throw new DatabaseError("Failed to fetch audit logs");
    }
  }

  async findAll(options: {
    page: number;
    limit: number;
    action?: string;
    userId?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const skip = (options.page - 1) * options.limit;
    const where: Prisma.AuditLogWhereInput = {};
    if (options.action) where.action = options.action;
    if (options.userId) where.userId = options.userId;
    if (options.from || options.to) {
      where.createdAt = {
        ...(options.from ? { gte: options.from } : {}),
        ...(options.to ? { lte: options.to } : {}),
      };
    }

    try {
      const [logs, total] = await this.prisma.$transaction([
        this.prisma.auditLog.findMany({ where, skip, take: options.limit, orderBy: { createdAt: "desc" } }),
        this.prisma.auditLog.count({ where }),
      ]);
      return { logs, total };
    } catch {
      throw new DatabaseError("Failed to fetch audit logs");
    }
  }

  async deleteOlderThan(date: Date): Promise<number> {
    try {
      const result = await this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: date } },
      });
      return result.count;
    } catch {
      throw new DatabaseError("Failed to delete old audit logs");
    }
  }
}

export const auditLogRepository = new AuditLogRepository();
