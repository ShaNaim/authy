import { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/errors";
import { HTTP_STATUS, ERROR_CODES } from "@/constants";
import logger from "@/utils/base.logger";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    error: {
      code: ERROR_CODES.NOT_FOUND_ERROR,
      message: `Route ${req.method} ${req.path} not found`,
    },
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  });
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError && err.isOperational) {
    if (err.statusCode >= 500) {
      logger.error("Operational error", {
        requestId: req.requestId,
        error: err.message,
        stack: err.stack,
      });
    }
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.errorCode, message: err.message, details: err.details },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
    return;
  }

  // Unexpected/programming errors
  logger.error("Unhandled error", {
    requestId: req.requestId,
    error: err.message,
    stack: err.stack,
  });

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "An unexpected error occurred",
    },
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  });
}
