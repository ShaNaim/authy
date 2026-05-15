import { Router, Request, Response, NextFunction } from "express";
import { authenticate, requireAdmin } from "@/middleware/auth.middleware";
import { validate } from "@/middleware/validation.middleware";
import { adminOrgController, orgAdminController, orgApiController } from "@/controllers/org.controller";
import { orgService } from "@/services/org.service";
import {
  createOrgSchema,
  updateOrgSchema,
  addOrgMemberSchema,
  orgRegisterSchema,
  orgLoginSchema,
} from "@/utils/validation.schemas";

const router = Router();

// ── Middleware: require org admin role ─────────────────────────────────────────

function requireOrgAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { message: "Unauthorized" } });
    return;
  }
  const { orgRole } = req.user;
  if (!orgRole || !["OWNER", "ADMIN"].includes(orgRole)) {
    res.status(403).json({ error: { message: "Requires org admin role" } });
    return;
  }
  next();
}

// ── Middleware: authenticate via org API secret ────────────────────────────────

async function authenticateOrgSecret(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: { message: "Organization secret required" } });
      return;
    }
    const rawSecret = authHeader.slice(7);
    const org = await orgService.authenticateOrgSecret(rawSecret);
    req.org = org;
    next();
  } catch (err) {
    next(err);
  }
}

// ── Admin routes: /admin/organizations/* (global admin only) ───────────────────

export const adminOrgRouter = Router();
adminOrgRouter.use(authenticate, requireAdmin);

adminOrgRouter.get("/", adminOrgController.list);
adminOrgRouter.post("/", validate(createOrgSchema), adminOrgController.create);
adminOrgRouter.get("/:orgId", adminOrgController.get);
adminOrgRouter.patch("/:orgId", validate(updateOrgSchema), adminOrgController.update);
adminOrgRouter.put("/:orgId/suspend", adminOrgController.suspend);
adminOrgRouter.put("/:orgId/reactivate", adminOrgController.reactivate);
adminOrgRouter.post("/:orgId/regenerate-secret", adminOrgController.regenerateSecret);
adminOrgRouter.get("/:orgId/members", adminOrgController.listMembers);
adminOrgRouter.post("/:orgId/members", validate(addOrgMemberSchema), adminOrgController.addMember);
adminOrgRouter.delete("/:orgId/members/:userId", adminOrgController.removeMember);
adminOrgRouter.get("/:orgId/apps", adminOrgController.listApps);
adminOrgRouter.get("/:orgId/users", adminOrgController.listUsers);

// ── Org admin routes: /org/* (authenticated + org admin role) ─────────────────

export const orgAdminRouter = Router();
orgAdminRouter.use(authenticate, requireOrgAdmin);

orgAdminRouter.get("/me", orgAdminController.getMe);
orgAdminRouter.patch("/me", validate(updateOrgSchema), orgAdminController.updateMe);
orgAdminRouter.get("/members", orgAdminController.listMembers);
orgAdminRouter.get("/apps", orgAdminController.listApps);
orgAdminRouter.get("/users", orgAdminController.listUsers);

// ── Public org API: /org-api/* (org secret auth) ──────────────────────────────

export const orgApiRouter = Router();
orgApiRouter.use(authenticateOrgSecret);

orgApiRouter.post("/register", validate(orgRegisterSchema), orgApiController.register);
orgApiRouter.post("/login", validate(orgLoginSchema), orgApiController.login);

export default router;
