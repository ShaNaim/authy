import { Request, Response, NextFunction } from "express";
import { AuthenticationError, AuthorizationError } from "@/utils/errors";

/**
 * Role system overview — two separate role concepts exist in this codebase:
 *
 *  1. UserRole  (system-level, stored on the User record)
 *     Values: USER | ADMIN | MODERATOR
 *     Scope:  Controls access to Authy's own admin dashboard, global admin APIs,
 *             and platform-level operations (e.g., suspend an org, manage all users).
 *     JWT:    Carried in `req.user.role` (the `role` claim).
 *
 *  2. OrgMemberRole  (org dashboard membership, stored in OrganizationMember)
 *     Values: OWNER | ADMIN | MEMBER
 *     Scope:  Controls access to a specific organization's management routes —
 *             e.g., creating OAuth apps, managing webhooks, viewing org users.
 *     JWT:    Carried in `req.user.orgRole` (the `orgRole` claim).
 *
 * Both share the label "ADMIN" but are UNRELATED.  A system ADMIN has no
 * implicit org-admin rights and must also hold an OrgMemberRole of OWNER or
 * ADMIN in the target organization.  This middleware ONLY checks OrgMemberRole.
 */
export function requireOrgAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AuthenticationError());
    return;
  }
  const { orgRole } = req.user;
  if (!orgRole || !["OWNER", "ADMIN"].includes(orgRole)) {
    next(new AuthorizationError("Requires org admin role"));
    return;
  }
  next();
}
