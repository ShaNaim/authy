// User & roles — sourced from Prisma so there is a single source of truth
export { UserRole } from "@prisma/client";

// Tokens
export enum TokenType {
  ACCESS = "access",
  REFRESH = "refresh",
}

export const DEFAULT_ACCESS_TOKEN_EXPIRY = "15m";
export const DEFAULT_REFRESH_TOKEN_EXPIRY = "7d";

// Audit actions (auth-centric)
export enum AuditAction {
  USER_REGISTERED = "USER_REGISTERED",
  LOGIN_SUCCESS = "LOGIN_SUCCESS",
  LOGIN_FAILED = "LOGIN_FAILED",
  LOGOUT = "LOGOUT",
  LOGOUT_ALL = "LOGOUT_ALL",
  TOKEN_REFRESHED = "TOKEN_REFRESHED",
  TOKEN_REVOKED = "TOKEN_REVOKED",
  PASSWORD_CHANGED = "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED = "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED = "PASSWORD_RESET_COMPLETED",
  EMAIL_VERIFICATION_SENT = "EMAIL_VERIFICATION_SENT",
  EMAIL_VERIFIED = "EMAIL_VERIFIED",
  ACCOUNT_LOCKED = "ACCOUNT_LOCKED",
  ACCOUNT_UNLOCKED = "ACCOUNT_UNLOCKED",
  ACCOUNT_DEACTIVATED = "ACCOUNT_DEACTIVATED",
  ACCOUNT_DELETED = "ACCOUNT_DELETED",
  PROFILE_UPDATED = "PROFILE_UPDATED",
  USER_UPDATED = "USER_UPDATED",
}

// Password rules
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: "!@#$%^&*()_+-=[]{}|;:,.<>?",
};

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
