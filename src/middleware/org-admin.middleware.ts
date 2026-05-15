import { Request, Response, NextFunction } from "express";
import { AuthenticationError, AuthorizationError } from "@/utils/errors";

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
