import { UserRole } from "@/constants";

/**
 * User object from database (matches Prisma model)
 */
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isVerified: boolean;
  isActive: boolean;
  emailVerificationToken?: string | null;
  emailVerificationExpiry?: Date | null;
  passwordResetToken?: string | null;
  passwordResetExpiry?: Date | null;
  lastLoginAt?: Date | null;
  lastLoginIp?: string | null;
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Sanitized user object (no sensitive fields)
 * This is what we return to clients
 */
export interface UserResponse {
  id: string;
  email: string;
  role: UserRole;
  isVerified: boolean;
  isActive: boolean;
  // Profile fields
  firstName?: string | null;
  lastName?: string | null;
  contact?: string | null;
  address?: string | null;
  dob?: Date | null;
  nid?: string | null;
  // Organisational fields (admin-managed)
  designation?: string | null;
  department?: string | null;
  position?: string | null;
  identifierNumber?: string | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
}

/**
 * Per-app permission snapshot embedded in the JWT
 */
export interface AppPermission {
  role: string;
  roleVersion: number;
  features: string[];
}

/**
 * JWT Access Token Payload
 */
export interface AccessTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  type: "access";
  jti: string;
  // keyed by appId — populated at login from user's active app memberships
  appPermissions?: Record<string, AppPermission>;
  iat?: number;
  exp?: number;
}

/**
 * JWT Refresh Token Payload
 */
export interface RefreshTokenPayload {
  userId: string;
  tokenId: string; // Database refresh token ID
  type: "refresh";
  iat?: number;
  exp?: number;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Registration data
 */
export interface RegisterData {
  email: string;
  password: string;
}

/**
 * Auth tokens response
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Login response
 */
export interface LoginResponse {
  user: UserResponse;
  tokens: AuthTokens;
}

/**
 * Password reset request
 */
export interface PasswordResetRequest {
  email: string;
}

/**
 * Password reset confirmation
 */
export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

/**
 * Change password data
 */
export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

/**
 * Session data
 */
export interface SessionData {
  id: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  userId?: string | null;
  action: string;
  details?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
}
