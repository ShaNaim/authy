import { Router } from "express";
import { aclController } from "@/controllers/acl.controller";
import { authenticate, requireAdmin } from "@/middleware/auth.middleware";
import { validate } from "@/middleware/validation.middleware";
import {
  createAppSchema,
  updateAppSchema,
  addFeatureSchema,
  updateFeatureSchema,
  createRoleSchema,
  updateRoleSchema,
  setRoleFeaturesSchema,
  assignUserToAppSchema,
  updateUserAppSchema,
  setUserFeaturesSchema,
} from "@/utils/validation.schemas";

const router = Router();

router.use(authenticate, requireAdmin);

// ── Apps ──────────────────────────────────────────────────────────────────────
router.get("/apps", aclController.listApps);
router.post("/apps", validate(createAppSchema), aclController.registerApp);
router.get("/apps/:appId", aclController.getApp);
router.patch("/apps/:appId", validate(updateAppSchema), aclController.updateApp);
router.put("/apps/:appId/suspend", aclController.suspendApp);
router.put("/apps/:appId/reactivate", aclController.reactivateApp);
router.post("/apps/:appId/regenerate-secret", aclController.regenerateSecret);

// ── Features ──────────────────────────────────────────────────────────────────
router.get("/apps/:appId/features", aclController.listFeatures);
router.post("/apps/:appId/features", validate(addFeatureSchema), aclController.addFeature);
router.patch("/features/:featureId", validate(updateFeatureSchema), aclController.updateFeature);
router.delete("/features/:featureId", aclController.removeFeature);

// ── Feature Sync Requests ─────────────────────────────────────────────────────
router.get("/sync-requests", aclController.listSyncRequests);
router.put("/sync-requests/:requestId/approve", aclController.approveSyncRequest);
router.put("/sync-requests/:requestId/reject", aclController.rejectSyncRequest);

// ── Roles ─────────────────────────────────────────────────────────────────────
router.get("/apps/:appId/roles", aclController.listRoles);
router.post("/apps/:appId/roles", validate(createRoleSchema), aclController.createRole);
router.patch("/roles/:roleId", validate(updateRoleSchema), aclController.updateRole);
router.delete("/roles/:roleId", aclController.deleteRole);
router.get("/roles/:roleId/features", aclController.getRoleFeatures);
router.put("/roles/:roleId/features", validate(setRoleFeaturesSchema), aclController.setRoleFeatures);

// ── User-App Access ───────────────────────────────────────────────────────────
router.get("/apps/:appId/users", aclController.listAppUsers);
router.post("/apps/:appId/users", validate(assignUserToAppSchema), aclController.assignUser);
router.patch("/apps/:appId/users/:userId", validate(updateUserAppSchema), aclController.updateUserAccess);
router.delete("/apps/:appId/users/:userId", aclController.removeUser);
router.put("/apps/:appId/users/:userId/features", validate(setUserFeaturesSchema), aclController.setUserFeatures);

export default router;
