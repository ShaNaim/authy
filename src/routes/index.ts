import { Router } from "express";
import { env } from "@/config/env";
import authRoutes from "./auth.routes";
import adminRoutes from "./admin.routes";
import aclRoutes from "./acl.routes";
import notificationRoutes from "./notification.routes";
import internalRoutes from "./internal.routes";
import healthRoutes from "./health.routes";

const router = Router();
const prefix = `/api/${env.API_VERSION}`;

router.use(`${prefix}/auth`, authRoutes);
router.use(`${prefix}/admin`, adminRoutes);
router.use(`${prefix}/admin`, aclRoutes);
router.use(`${prefix}/admin/notifications`, notificationRoutes);
router.use(`${prefix}/internal`, internalRoutes);
router.use("/health", healthRoutes);

export default router;
