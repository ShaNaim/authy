import { Router } from "express";
import { env } from "@/config/env";
import authRoutes from "./auth.routes";
import adminRoutes from "./admin.routes";
import aclRoutes from "./acl.routes";
import notificationRoutes from "./notification.routes";
import internalRoutes from "./internal.routes";
import healthRoutes from "./health.routes";
import { adminOrgRouter, orgAdminRouter, orgApiRouter } from "./org.routes";
import orgApiKeyRoutes from "./org-api-key.routes";
import oauthRoutes, { oauthAppRouter, wellKnownRouter } from "./oauth.routes";
import webhookRoutes from "./webhook.routes";
import checkRoutes from "./check.routes";

const router = Router();
const prefix = `/api/${env.API_VERSION}`;

router.use(`${prefix}/auth`, authRoutes);
router.use(`${prefix}/admin`, adminRoutes);
router.use(`${prefix}/admin`, aclRoutes);
router.use(`${prefix}/admin/notifications`, notificationRoutes);
router.use(`${prefix}/admin/organizations`, adminOrgRouter);
router.use(`${prefix}/org`, orgAdminRouter);
router.use(`${prefix}/org/api-keys`, orgApiKeyRoutes);
router.use(`${prefix}/org/oauth-apps`, oauthAppRouter);
router.use(`${prefix}/org/webhooks`, webhookRoutes);
router.use(`${prefix}/org-api`, orgApiRouter);
router.use(`${prefix}/oauth`, oauthRoutes);
router.use(`${prefix}/check`, checkRoutes);
router.use(`${prefix}/internal`, internalRoutes);
router.use("/.well-known", wellKnownRouter);
router.use("/health", healthRoutes);

export default router;
