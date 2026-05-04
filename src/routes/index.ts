import { Router } from "express";
import { env } from "@/config/env";
import authRoutes from "./auth.routes";
import adminRoutes from "./admin.routes";
import internalRoutes from "./internal.routes";
import healthRoutes from "./health.routes";

const router = Router();
const prefix = `/api/${env.API_VERSION}`;

router.use(`${prefix}/auth`, authRoutes);
router.use(`${prefix}/admin`, adminRoutes);
router.use(`${prefix}/internal`, internalRoutes);
router.use("/health", healthRoutes);

export default router;
