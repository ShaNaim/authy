import { Router } from "express";
import { adminController } from "@/controllers/admin.controller";
import { authenticate, requireAdmin } from "@/middleware/auth.middleware";

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

router.get("/users", adminController.listUsers);
router.get("/users/:id", adminController.getUser);
router.put("/users/:id/suspend", adminController.suspendUser);
router.put("/users/:id/activate", adminController.activateUser);
router.delete("/users/:id", adminController.deleteUser);

// Audit log endpoints
router.get("/audit-logs", adminController.getAuditLogs);
router.get("/users/:id/audit-logs", adminController.getUserAuditLogs);

export default router;
