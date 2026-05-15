import { Router } from "express";
import { authenticate } from "@/middleware/auth.middleware";
import { requireOrgAdmin } from "@/middleware/org-admin.middleware";
import { validate } from "@/middleware/validation.middleware";
import { oauthController } from "@/controllers/oauth.controller";
import { createOAuthAppSchema, updateOAuthAppSchema } from "@/utils/validation.schemas";

const router = Router();

// ── OIDC Discovery + JWKs (public, no auth) ────────────────────────────────

export const wellKnownRouter = Router();
wellKnownRouter.get("/openid-configuration", oauthController.discovery);
wellKnownRouter.get("/jwks.json", oauthController.jwks);

// ── OAuth flows (public) ───────────────────────────────────────────────────

router.post("/authorize", oauthController.authorize);
router.post("/token", oauthController.token);
router.post("/introspect", oauthController.introspect);

// ── OAuth App management (org admin only) ──────────────────────────────────

export const oauthAppRouter = Router();
oauthAppRouter.use(authenticate, requireOrgAdmin);

oauthAppRouter.get("/", oauthController.listApps);
oauthAppRouter.post("/", validate(createOAuthAppSchema), oauthController.createApp);
oauthAppRouter.get("/:appId", oauthController.getApp);
oauthAppRouter.patch("/:appId", validate(updateOAuthAppSchema), oauthController.updateApp);
oauthAppRouter.post("/:appId/regenerate-secret", oauthController.regenerateSecret);
oauthAppRouter.delete("/:appId", oauthController.deleteApp);

export default router;
