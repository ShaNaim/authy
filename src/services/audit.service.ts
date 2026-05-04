import { auditLogRepository, CreateAuditLogData } from "@/repositories/audit-log.repository";
import logger from "@/utils/base.logger";
import { AuditLog } from "@prisma/client";

export class AuditService {
  async log(data: CreateAuditLogData): Promise<void> {
    try {
      await auditLogRepository.create(data);
    } catch (err) {
      // Audit logging must never crash the application
      logger.error("Failed to write audit log", { error: err, action: data.action });
    }
  }

  async getUserLogs(
    userId: string,
    page: number,
    limit: number
  ): Promise<{ logs: AuditLog[]; total: number }> {
    return auditLogRepository.findByUserId(userId, { page, limit });
  }

  async getAllLogs(options: {
    page: number;
    limit: number;
    action?: string;
    userId?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    return auditLogRepository.findAll(options);
  }
}

export const auditService = new AuditService();
