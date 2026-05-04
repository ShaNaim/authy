import rateLimit from "express-rate-limit";
import { env } from "@/config/env";
import { ERROR_CODES } from "@/constants";

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: ERROR_CODES.RATE_LIMIT_ERROR, message: "Too many requests, please try again later" },
      meta: { timestamp: new Date().toISOString() },
    });
  },
});

export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: ERROR_CODES.RATE_LIMIT_ERROR, message: "Too many authentication attempts, please try again later" },
      meta: { timestamp: new Date().toISOString() },
    });
  },
});

export const resendRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: ERROR_CODES.RATE_LIMIT_ERROR, message: "Too many resend requests, please try again in an hour" },
      meta: { timestamp: new Date().toISOString() },
    });
  },
});
