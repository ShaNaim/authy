import crypto from "crypto";
import { WebhookEventType } from "@prisma/client";
import { webhookRepository } from "@/repositories/webhook.repository";
import { orgRepository } from "@/repositories/org.repository";
import { auditService } from "@/services/audit.service";
import { enqueueWebhook, WebhookJob } from "@/services/queue.service";
import { PLAN_LIMITS } from "@/constants/plans.constants";
import { NotFoundError, AuthorizationError, ValidationError } from "@/utils/errors";
import { AuditAction } from "@/constants";
import type { RequestMeta } from "@/services/auth.service";
import logger from "@/utils/base.logger";

function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export class WebhookService {
  async create(
    organizationId: string,
    data: { url: string; events: WebhookEventType[] },
    adminId: string,
    meta: RequestMeta = {}
  ) {
    const org = await orgRepository.findById(organizationId);
    if (!org) throw new NotFoundError("Organization not found");

    const limits = PLAN_LIMITS[org.plan];
    const count = await webhookRepository.countByOrg(organizationId);
    if (count >= limits.maxWebhooks) {
      throw new ValidationError(
        `Your plan allows a maximum of ${limits.maxWebhooks} webhooks. Upgrade to create more.`
      );
    }

    const secret = generateWebhookSecret();
    const webhook = await webhookRepository.create({ organizationId, url: data.url, secret, events: data.events });

    await auditService.log({
      userId: adminId,
      action: AuditAction.WEBHOOK_CREATED,
      details: { organizationId, webhookId: webhook.id, url: webhook.url },
      ...meta,
    });

    return webhook;
  }

  async list(organizationId: string) {
    return webhookRepository.listByOrg(organizationId);
  }

  async get(id: string, organizationId: string) {
    const wh = await webhookRepository.findById(id);
    if (!wh) throw new NotFoundError("Webhook not found");
    if (wh.organizationId !== organizationId) throw new AuthorizationError("Webhook does not belong to this organization");
    return wh;
  }

  async update(
    id: string,
    organizationId: string,
    data: { url?: string; events?: WebhookEventType[]; isActive?: boolean },
    adminId: string,
    meta: RequestMeta = {}
  ) {
    const wh = await webhookRepository.findById(id);
    if (!wh) throw new NotFoundError("Webhook not found");
    if (wh.organizationId !== organizationId) throw new AuthorizationError("Webhook does not belong to this organization");

    const updated = await webhookRepository.update(id, data);

    await auditService.log({
      userId: adminId,
      action: AuditAction.WEBHOOK_UPDATED,
      details: { webhookId: id, changes: data },
      ...meta,
    });

    return updated;
  }

  async delete(id: string, organizationId: string, adminId: string, meta: RequestMeta = {}): Promise<void> {
    const wh = await webhookRepository.findById(id);
    if (!wh) throw new NotFoundError("Webhook not found");
    if (wh.organizationId !== organizationId) throw new AuthorizationError("Webhook does not belong to this organization");

    await webhookRepository.delete(id);

    await auditService.log({
      userId: adminId,
      action: AuditAction.WEBHOOK_DELETED,
      details: { webhookId: id, url: wh.url },
      ...meta,
    });
  }

  async listDeliveries(id: string, organizationId: string) {
    const wh = await webhookRepository.findById(id);
    if (!wh) throw new NotFoundError("Webhook not found");
    if (wh.organizationId !== organizationId) throw new AuthorizationError("Webhook does not belong to this organization");
    return webhookRepository.listDeliveriesByWebhook(id);
  }

  async sendTest(id: string, organizationId: string, adminId: string): Promise<void> {
    const wh = await webhookRepository.findById(id);
    if (!wh) throw new NotFoundError("Webhook not found");
    if (wh.organizationId !== organizationId) throw new AuthorizationError("Webhook does not belong to this organization");

    const deliveryId = crypto.randomUUID();
    const job: WebhookJob = {
      webhookId: wh.id,
      organizationId,
      url: wh.url,
      secret: wh.secret,
      event: "USER_LOGIN",
      payload: { test: true, timestamp: new Date().toISOString(), triggeredBy: adminId },
      deliveryId,
    };
    await enqueueWebhook(job);
  }

  // ── Dispatch (called by other services after events) ───────────────────────

  async dispatch(
    organizationId: string,
    event: WebhookEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      const webhooks = await webhookRepository.findActiveByOrgAndEvent(organizationId, event);
      for (const wh of webhooks) {
        const deliveryId = crypto.randomUUID();
        await enqueueWebhook({
          webhookId: wh.id,
          organizationId,
          url: wh.url,
          secret: wh.secret,
          event,
          payload: { ...payload, event, timestamp: new Date().toISOString() },
          deliveryId,
        });
      }
    } catch (err) {
      logger.error("Failed to dispatch webhook", { organizationId, event, err });
    }
  }
}

export const webhookService = new WebhookService();
