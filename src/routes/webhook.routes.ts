import { Router } from "express";
import { authenticate } from "@/middleware/auth.middleware";
import { requireOrgAdmin } from "@/middleware/org-admin.middleware";
import { validate } from "@/middleware/validation.middleware";
import { webhookController } from "@/controllers/webhook.controller";
import { createWebhookSchema, updateWebhookSchema } from "@/utils/validation.schemas";

const router = Router();

router.use(authenticate, requireOrgAdmin);

router.get("/", webhookController.list);
router.post("/", validate(createWebhookSchema), webhookController.create);
router.get("/:webhookId", webhookController.get);
router.patch("/:webhookId", validate(updateWebhookSchema), webhookController.update);
router.delete("/:webhookId", webhookController.delete);
router.get("/:webhookId/deliveries", webhookController.listDeliveries);
router.post("/:webhookId/test", webhookController.sendTest);

export default router;
