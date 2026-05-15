import { Router } from "express";
import { authenticateOrgApiKey } from "@/middleware/org-api-key.middleware";
import { enforceApiCallQuota } from "@/middleware/quota.middleware";
import { validate } from "@/middleware/validation.middleware";
import { checkController } from "@/controllers/check.controller";
import { checkPermissionSchema, batchCheckPermissionSchema } from "@/utils/validation.schemas";

const router = Router();

// Both routes accept either an org API key (external) or a bearer token (internal dashboard testing).
// Quota is always enforced for org-keyed requests.

router.post(
  "/",
  authenticateOrgApiKey,
  enforceApiCallQuota,
  validate(checkPermissionSchema),
  checkController.check
);

router.post(
  "/batch",
  authenticateOrgApiKey,
  enforceApiCallQuota,
  validate(batchCheckPermissionSchema),
  checkController.batchCheck
);

export default router;
