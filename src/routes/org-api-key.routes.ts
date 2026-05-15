import { Router } from "express";
import { authenticate } from "@/middleware/auth.middleware";
import { validate } from "@/middleware/validation.middleware";
import { requireOrgAdmin } from "@/middleware/org-admin.middleware";
import { orgApiKeyController } from "@/controllers/org-api-key.controller";
import { createApiKeySchema, updateApiKeySchema } from "@/utils/validation.schemas";

const router = Router();

router.use(authenticate, requireOrgAdmin);

router.get("/", orgApiKeyController.list);
router.post("/", validate(createApiKeySchema), orgApiKeyController.create);
router.patch("/:keyId", validate(updateApiKeySchema), orgApiKeyController.update);
router.delete("/:keyId", orgApiKeyController.revoke);

export default router;
