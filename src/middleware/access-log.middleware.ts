import { Request, Response, NextFunction } from "express";
import logger from "@/utils/base.logger";

export function accessLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on("finish", () => {
    const duration = Date.now() - (req.startTime ?? Date.now());
    const meta = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    };

    if (res.statusCode >= 500) logger.error("HTTP", meta);
    else if (res.statusCode >= 400) logger.warn("HTTP", meta);
    else logger.info("HTTP", meta);
  });
  next();
}
