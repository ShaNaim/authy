import { connectDatabase, disconnectDatabase } from "@/config/database";
import { connectRedis, disconnectRedis } from "@/config/redis";
import { env } from "@/config/env";
import logger from "@/utils/base.logger";
import { closeQueues } from "@/services/queue.service";
import { startEmailWorkerService } from "@/services/email.service";
import { startWebhookWorkerService } from "@/services/webhook-worker.service";
import app from "@/app";
import http from "http";

let server: http.Server;

async function bootstrap(): Promise<void> {
  logger.info("Starting Authy Auth Service...", { environment: env.NODE_ENV, port: env.PORT });

  // Connect to infrastructure
  await connectDatabase();
  await connectRedis();

  // Start message queue workers
  try {
    startEmailWorkerService();
  } catch (err) {
    logger.warn("Email queue worker failed to start — emails will be skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    startWebhookWorkerService();
  } catch (err) {
    logger.warn("Webhook queue worker failed to start — webhook deliveries will be skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Start HTTP server
  server = app.listen(env.PORT, () => {
    logger.info(`Auth Service ready`, {
      port: env.PORT,
      apiVersion: env.API_VERSION,
      url: `http://localhost:${env.PORT}/api/${env.API_VERSION}`,
    });
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logger.error(`Port ${env.PORT} is already in use`);
    } else {
      logger.error("Server error", { error: err.message });
    }
    process.exit(1);
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down gracefully`);

  server?.close(async () => {
    logger.info("HTTP server closed");
    await Promise.all([closeQueues(), disconnectDatabase(), disconnectRedis()]);
    logger.info("Shutdown complete");
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});

void bootstrap();
