import { Request, Response } from "express";
import { checkDatabaseHealth } from "@/config/database";
import { checkRedisHealth } from "@/config/redis";
import { HTTP_STATUS } from "@/constants";

export const healthController = {
  async check(_req: Request, res: Response): Promise<void> {
    res.status(HTTP_STATUS.OK).json({
      status: "ok",
      service: "auth-service",
      timestamp: new Date().toISOString(),
    });
  },

  async ready(_req: Request, res: Response): Promise<void> {
    const [dbOk, redisOk] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);

    const status = dbOk && redisOk ? "ready" : "degraded";
    const statusCode = status === "ready" ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;

    res.status(statusCode).json({
      status,
      checks: {
        database: dbOk ? "ok" : "error",
        redis: redisOk ? "ok" : "error",
      },
      timestamp: new Date().toISOString(),
    });
  },
};
