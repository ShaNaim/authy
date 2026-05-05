import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "@/config/env";
import { requestIdMiddleware } from "@/middleware/request-id.middleware";
import { accessLogMiddleware } from "@/middleware/access-log.middleware";
import { globalRateLimiter } from "@/middleware/rate-limit.middleware";
import { notFoundHandler, errorHandler } from "@/middleware/error.middleware";
import router from "@/routes";

const app = express();

// ── Security headers ───────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ───────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.NODE_ENV === "production" ? env.FRONTEND_URL : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-Internal-API-Key"],
    exposedHeaders: ["X-Request-ID"],
  }),
);

// ── Request parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ── Request tracing + access logging ──────────────────────────────────────────
app.use(requestIdMiddleware);
app.use(accessLogMiddleware);

// ── Global rate limiter ────────────────────────────────────────────────────────
app.use(globalRateLimiter);

// ── Trust proxy (for correct client IP behind load balancer) ──────────────────
if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use(router);

// ── 404 + Error handling ───────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
