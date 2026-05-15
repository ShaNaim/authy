import crypto from "crypto";
import { Job } from "bullmq";
import { Prisma, WebhookEventType } from "@prisma/client";
import { startWebhookWorker, WebhookJob } from "@/services/queue.service";
import { webhookRepository } from "@/repositories/webhook.repository";
import logger from "@/utils/base.logger";

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function processWebhookJob(job: Job<WebhookJob>): Promise<void> {
  const { webhookId, url, secret, event, payload, deliveryId } = job.data;
  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);

  let responseStatus: number | undefined;
  let responseBody: string | undefined;
  let success = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Authy-Event": event,
          "X-Authy-Signature": signature,
          "X-Authy-Delivery-Id": deliveryId,
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    responseStatus = response.status;
    const text = await response.text().catch(() => "");
    responseBody = text.slice(0, 1000);
    success = response.status >= 200 && response.status < 300;
  } catch (err) {
    responseBody = err instanceof Error ? err.message : String(err);
    logger.warn("Webhook delivery failed (network)", { webhookId, deliveryId, err: responseBody });
    throw err; // Let BullMQ handle retry
  } finally {
    await webhookRepository.createDelivery({
      webhookId,
      deliveryId,
      event: event as WebhookEventType,
      payload: payload as unknown as Prisma.JsonObject,
      responseStatus,
      responseBody,
      attemptCount: (job.attemptsMade ?? 0) + 1,
      success,
    }).catch((e) => logger.error("Failed to log webhook delivery", { e }));

    if (success) {
      webhookRepository.touchLastDelivered(webhookId).catch(() => undefined);
    }
  }

  if (!success) {
    throw new Error(`Webhook endpoint returned ${responseStatus}`);
  }
}

export function startWebhookWorkerService(): void {
  startWebhookWorker(processWebhookJob);
}
