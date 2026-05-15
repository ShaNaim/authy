import { PrismaClient, OrgWebhook, WebhookDelivery, WebhookEventType, Prisma } from "@prisma/client";
import { getPrismaClient } from "@/config/database";
import { DatabaseError } from "@/utils/errors";

export class WebhookRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  async create(data: {
    organizationId: string;
    url: string;
    secret: string;
    events: WebhookEventType[];
  }): Promise<OrgWebhook> {
    try {
      return await this.prisma.orgWebhook.create({ data });
    } catch {
      throw new DatabaseError("Failed to create webhook");
    }
  }

  async findById(id: string): Promise<OrgWebhook | null> {
    try {
      return await this.prisma.orgWebhook.findUnique({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to find webhook");
    }
  }

  async listByOrg(organizationId: string): Promise<OrgWebhook[]> {
    try {
      return await this.prisma.orgWebhook.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      });
    } catch {
      throw new DatabaseError("Failed to list webhooks");
    }
  }

  async findActiveByOrgAndEvent(organizationId: string, event: WebhookEventType): Promise<OrgWebhook[]> {
    try {
      return await this.prisma.orgWebhook.findMany({
        where: {
          organizationId,
          isActive: true,
          events: { has: event },
        },
      });
    } catch {
      throw new DatabaseError("Failed to find webhooks for event");
    }
  }

  async update(
    id: string,
    data: { url?: string; events?: WebhookEventType[]; isActive?: boolean }
  ): Promise<OrgWebhook> {
    try {
      return await this.prisma.orgWebhook.update({ where: { id }, data });
    } catch {
      throw new DatabaseError("Failed to update webhook");
    }
  }

  async touchLastDelivered(id: string): Promise<void> {
    try {
      await this.prisma.orgWebhook.update({ where: { id }, data: { lastDeliveredAt: new Date() } });
    } catch {
      // Non-critical
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.orgWebhook.delete({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to delete webhook");
    }
  }

  async countByOrg(organizationId: string): Promise<number> {
    try {
      return await this.prisma.orgWebhook.count({ where: { organizationId } });
    } catch {
      throw new DatabaseError("Failed to count webhooks");
    }
  }

  // ── Delivery Log ───────────────────────────────────────────────────────────

  async createDelivery(data: {
    webhookId: string;
    deliveryId: string;
    event: WebhookEventType;
    payload: Prisma.JsonObject;
    responseStatus?: number;
    responseBody?: string;
    attemptCount: number;
    success: boolean;
  }): Promise<WebhookDelivery> {
    try {
      return await this.prisma.webhookDelivery.create({ data });
    } catch {
      throw new DatabaseError("Failed to log webhook delivery");
    }
  }

  async listDeliveriesByWebhook(
    webhookId: string,
    limit = 50
  ): Promise<WebhookDelivery[]> {
    try {
      return await this.prisma.webhookDelivery.findMany({
        where: { webhookId },
        orderBy: { deliveredAt: "desc" },
        take: limit,
      });
    } catch {
      throw new DatabaseError("Failed to list webhook deliveries");
    }
  }
}

export const webhookRepository = new WebhookRepository();
