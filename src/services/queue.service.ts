import { Queue, Worker, Job } from "bullmq";
import { env } from "@/config/env";
import logger from "@/utils/base.logger";

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export const QUEUE_NAMES = {
  EMAIL: "authy-email",
} as const;

export const EMAIL_JOB_TYPES = {
  SEND_VERIFICATION: "send-verification-email",
  SEND_PASSWORD_RESET: "send-password-reset-email",
  SEND_WELCOME: "send-welcome-email",
  SEND_PASSWORD_CHANGED: "send-password-changed-email",
  SEND_ADMIN_NOTIFICATION: "send-admin-notification-email",
} as const;

export interface SendVerificationEmailJob {
  type: typeof EMAIL_JOB_TYPES.SEND_VERIFICATION;
  to: string;
  token: string;
  userName?: string;
}

export interface SendPasswordResetEmailJob {
  type: typeof EMAIL_JOB_TYPES.SEND_PASSWORD_RESET;
  to: string;
  token: string;
  userName?: string;
}

export interface SendWelcomeEmailJob {
  type: typeof EMAIL_JOB_TYPES.SEND_WELCOME;
  to: string;
  userName?: string;
}

export interface SendPasswordChangedEmailJob {
  type: typeof EMAIL_JOB_TYPES.SEND_PASSWORD_CHANGED;
  to: string;
  userName?: string;
}

export interface SendAdminNotificationEmailJob {
  type: typeof EMAIL_JOB_TYPES.SEND_ADMIN_NOTIFICATION;
  to: string;
  title: string;
  body: string;
  html?: string;
  userName?: string;
}

export type EmailJob =
  | SendVerificationEmailJob
  | SendPasswordResetEmailJob
  | SendWelcomeEmailJob
  | SendPasswordChangedEmailJob
  | SendAdminNotificationEmailJob;

let emailQueue: Queue<EmailJob> | null = null;
let emailWorker: Worker<EmailJob> | null = null;

export function getEmailQueue(): Queue<EmailJob> {
  if (!emailQueue) {
    emailQueue = new Queue<EmailJob>(QUEUE_NAMES.EMAIL, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });

    emailQueue.on("error", (err) => {
      logger.error("Email queue error", { error: err.message });
    });
  }
  return emailQueue;
}

export async function enqueueEmail(job: EmailJob): Promise<void> {
  try {
    const queue = getEmailQueue();
    await queue.add(job.type, job, { priority: 1 });
    logger.debug("Email job enqueued", { type: job.type, to: job.to });
  } catch (err) {
    logger.error("Failed to enqueue email job", {
      error: err instanceof Error ? err.message : String(err),
      type: job.type,
    });
  }
}

export function startEmailWorker(
  processor: (job: Job<EmailJob>) => Promise<void>
): Worker<EmailJob> {
  if (!emailWorker) {
    emailWorker = new Worker<EmailJob>(QUEUE_NAMES.EMAIL, processor, {
      connection,
      concurrency: 5,
    });

    emailWorker.on("completed", (job) => {
      logger.debug("Email job completed", { jobId: job.id, type: job.name });
    });

    emailWorker.on("failed", (job, err) => {
      logger.error("Email job failed", { jobId: job?.id, type: job?.name, error: err.message });
    });

    emailWorker.on("error", (err) => {
      logger.error("Email worker error", { error: err.message });
    });

    logger.info("Email queue worker started");
  }
  return emailWorker;
}

export async function closeQueues(): Promise<void> {
  try {
    if (emailWorker) {
      await emailWorker.close();
      emailWorker = null;
    }
    if (emailQueue) {
      await emailQueue.close();
      emailQueue = null;
    }
    logger.info("Queues closed");
  } catch (err) {
    logger.error("Error closing queues", { error: err });
  }
}
