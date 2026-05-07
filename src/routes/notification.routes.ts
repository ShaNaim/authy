import { Router } from "express";
import { notificationController } from "@/controllers/notification.controller";
import { authenticate, requireAdmin } from "@/middleware/auth.middleware";
import { validate } from "@/middleware/validation.middleware";
import { createNotifSubSchema } from "@/utils/validation.schemas";

const router = Router();

// Admin-only — notifications and subscription management
router.use(authenticate, requireAdmin);

// ── Inbox ─────────────────────────────────────────────────────────────────────
router.get("/", notificationController.list);
router.get("/unread-count", notificationController.getUnreadCount);
router.put("/:id/read", notificationController.markRead);
router.put("/mark-all-read", notificationController.markAllRead);

// ── Subscriptions ─────────────────────────────────────────────────────────────
router.get("/subscriptions", notificationController.listSubs);
router.post("/subscriptions", validate(createNotifSubSchema), notificationController.createSub);
router.delete("/subscriptions/:id", notificationController.deleteSub);

export default router;
