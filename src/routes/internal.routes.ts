import { Router } from "express";
import { internalController, internalApiKeyGuard } from "@/controllers/internal.controller";

const router = Router();

// All internal routes require the internal API key
router.use(internalApiKeyGuard);

router.post("/verify-token", internalController.verifyToken);
router.get("/users/:id", internalController.getUser);

export default router;
