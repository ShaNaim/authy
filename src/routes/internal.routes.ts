import { Router } from "express";
import { internalController, internalApiKeyGuard, appSecretGuard } from "@/controllers/internal.controller";

const router = Router();

// Global internal API key routes (Authy infrastructure)
router.use(internalApiKeyGuard);

router.post("/verify-token", internalController.verifyToken);
router.get("/users/:id", internalController.getUser);

// App-secret-authenticated routes (registered client apps)
router.post("/sync-features", appSecretGuard, internalController.syncFeatures);
router.get("/users/:userId/permissions", appSecretGuard, internalController.getUserPermissions);

export default router;
