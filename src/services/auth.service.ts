import { User } from "@prisma/client";
import { UserRole } from "@/constants";
import { userRepository } from "@/repositories/user.repository";
import { cacheService } from "@/services/cache.service";
import { tokenService } from "@/services/token.service";
import { auditService } from "@/services/audit.service";
import { enqueueEmail } from "@/services/queue.service";
import { EMAIL_JOB_TYPES } from "@/services/queue.service";
import {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
} from "@/utils/password.utils";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
} from "@/utils/jwt.utils";
import { generateExpiryDate } from "@/utils/token.utils";
import {
  ConflictError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  AccountLockedError,
} from "@/utils/errors";
import { AuditAction } from "@/constants";
import { env } from "@/config/env";
import { UserResponse, AccessTokenPayload, RefreshTokenPayload, AuthTokens } from "@/types";
import { v4 as uuidv4 } from "uuid";

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    role: user.role as unknown as UserRole,
    isVerified: user.isVerified,
    isActive: user.isActive,
    firstName: user.firstName,
    lastName: user.lastName,
    contact: user.contact,
    address: user.address,
    dob: user.dob,
    nid: user.nid,
    designation: user.designation,
    department: user.department,
    position: user.position,
    identifierNumber: user.identifierNumber,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export class AuthService {
  // ── Register ──────────────────────────────────────────────────────────────

  async register(
    data: { email: string; password: string },
    meta: RequestMeta = {}
  ): Promise<{ user: UserResponse; message: string }> {
    const existing = await userRepository.findByEmail(data.email);
    if (existing) {
      throw new ConflictError("An account with this email already exists");
    }

    const { valid, errors } = validatePasswordStrength(data.password);
    if (!valid) {
      throw new ValidationError("Password does not meet requirements", errors);
    }

    const passwordHash = await hashPassword(data.password);
    const user = await userRepository.create({ email: data.email, passwordHash });

    // Save initial password to history
    await userRepository.addPasswordHistory(user.id, passwordHash, env.PASSWORD_HISTORY_LIMIT);

    // Create and queue verification email
    const verificationToken = await tokenService.createEmailVerificationToken(user.id);
    void enqueueEmail({
      type: EMAIL_JOB_TYPES.SEND_VERIFICATION,
      to: user.email,
      token: verificationToken,
    });

    await auditService.log({
      userId: user.id,
      action: AuditAction.USER_REGISTERED,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return {
      user: toUserResponse(user),
      message: "Account created. Please check your email to verify your account.",
    };
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  async login(
    credentials: { email: string; password: string },
    meta: RequestMeta = {}
  ): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    const user = await userRepository.findByEmail(credentials.email);
    const genericError = new AuthenticationError("Invalid email or password");

    if (!user || !user.isActive) {
      await auditService.log({
        action: AuditAction.LOGIN_FAILED,
        details: { email: credentials.email, reason: "user_not_found" },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      });
      throw genericError;
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AccountLockedError(user.lockedUntil);
    }

    const passwordValid = await comparePassword(credentials.password, user.passwordHash);
    if (!passwordValid) {
      const updated = await userRepository.incrementFailedLoginAttempts(user.id);
      const attemptsLeft = env.MAX_LOGIN_ATTEMPTS - updated.failedLoginAttempts;

      if (updated.failedLoginAttempts >= env.MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = generateExpiryDate(env.LOCKOUT_DURATION_MINUTES * 60 * 1000);
        await userRepository.lockAccount(user.id, lockedUntil);
        await auditService.log({
          userId: user.id,
          action: AuditAction.ACCOUNT_LOCKED,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        });
        throw new AccountLockedError(lockedUntil);
      }

      await auditService.log({
        userId: user.id,
        action: AuditAction.LOGIN_FAILED,
        details: { attemptsLeft: Math.max(0, attemptsLeft) },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      });
      throw genericError;
    }

    if (!user.isVerified) {
      throw new AuthorizationError("Please verify your email address before logging in");
    }

    // Successful login — reset attempts, update last login
    await userRepository.resetLoginAttempts(user.id, meta.ipAddress);

    const tokens = await this.issueTokens(user, meta);

    await auditService.log({
      userId: user.id,
      action: AuditAction.LOGIN_SUCCESS,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return { user: toUserResponse(user), tokens };
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  async logout(
    userId: string,
    accessTokenJti: string,
    accessTokenExp: number,
    rawRefreshToken: string,
    meta: RequestMeta = {}
  ): Promise<void> {
    await Promise.all([
      tokenService.blacklistAccessToken(accessTokenJti, accessTokenExp),
      tokenService.revokeRefreshToken(rawRefreshToken),
    ]);

    await auditService.log({
      userId,
      action: AuditAction.LOGOUT,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  // ── Logout All Devices ─────────────────────────────────────────────────────

  async logoutAll(
    userId: string,
    currentAccessTokenJti: string,
    currentAccessTokenExp: number,
    meta: RequestMeta = {}
  ): Promise<void> {
    const revocationTime = Math.floor(Date.now() / 1000);
    await Promise.all([
      tokenService.revokeAllUserRefreshTokens(userId),
      cacheService.setUserRevocationTime(userId, revocationTime),
      tokenService.blacklistAccessToken(currentAccessTokenJti, currentAccessTokenExp),
    ]);
    await cacheService.invalidateUser(userId);

    await auditService.log({
      userId,
      action: AuditAction.LOGOUT_ALL,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  // ── Refresh Tokens ─────────────────────────────────────────────────────────

  async refreshTokens(
    rawRefreshToken: string,
    meta: RequestMeta = {}
  ): Promise<AuthTokens> {
    const { payload } = await tokenService.verifyAndConsumeRefreshToken(rawRefreshToken);

    const user = await userRepository.findById(payload.userId);
    if (!user || !user.isActive) {
      throw new AuthenticationError("User account is inactive");
    }

    const tokens = await this.issueTokens(user, meta);

    await auditService.log({
      userId: user.id,
      action: AuditAction.TOKEN_REFRESHED,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return tokens;
  }

  // ── Verify Email ───────────────────────────────────────────────────────────

  async verifyEmail(rawToken: string, meta: RequestMeta = {}): Promise<{ message: string }> {
    const userId = await tokenService.consumeEmailVerificationToken(rawToken);
    const user = await userRepository.findById(userId);

    if (!user) throw new NotFoundError("User not found");
    if (user.isVerified) return { message: "Email already verified" };

    await userRepository.markEmailVerified(userId);
    await cacheService.invalidateUser(userId);

    void enqueueEmail({ type: EMAIL_JOB_TYPES.SEND_WELCOME, to: user.email });

    await auditService.log({
      userId,
      action: AuditAction.EMAIL_VERIFIED,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return { message: "Email verified successfully" };
  }

  // ── Resend Verification Email ──────────────────────────────────────────────

  async resendVerificationEmail(email: string, meta: RequestMeta = {}): Promise<{ message: string }> {
    const user = await userRepository.findByEmail(email);
    const genericMsg = { message: "If an account with that email exists, a verification email will be sent." };

    if (!user || user.isVerified) return genericMsg;

    const token = await tokenService.createEmailVerificationToken(user.id);
    void enqueueEmail({ type: EMAIL_JOB_TYPES.SEND_VERIFICATION, to: user.email, token });

    await auditService.log({
      userId: user.id,
      action: AuditAction.EMAIL_VERIFICATION_SENT,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return genericMsg;
  }

  // ── Forgot Password ────────────────────────────────────────────────────────

  async forgotPassword(email: string, meta: RequestMeta = {}): Promise<{ message: string }> {
    const genericMsg = { message: "If an account with that email exists, a password reset link will be sent." };
    const user = await userRepository.findByEmail(email);
    if (!user || !user.isActive) return genericMsg;

    const token = await tokenService.createPasswordResetToken(user.id);
    void enqueueEmail({ type: EMAIL_JOB_TYPES.SEND_PASSWORD_RESET, to: user.email, token });

    await auditService.log({
      userId: user.id,
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return genericMsg;
  }

  // ── Reset Password ─────────────────────────────────────────────────────────

  async resetPassword(
    rawToken: string,
    newPassword: string,
    meta: RequestMeta = {}
  ): Promise<{ message: string }> {
    const { valid, errors } = validatePasswordStrength(newPassword);
    if (!valid) throw new ValidationError("Password does not meet requirements", errors);

    const userId = await tokenService.consumePasswordResetToken(rawToken);
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    await this.enforcePasswordHistory(user.id, newPassword);

    const passwordHash = await hashPassword(newPassword);
    await userRepository.updatePassword(user.id, passwordHash);
    await userRepository.addPasswordHistory(user.id, passwordHash, env.PASSWORD_HISTORY_LIMIT);

    // Revoke all sessions for security
    await tokenService.revokeAllUserRefreshTokens(user.id);
    await cacheService.setUserRevocationTime(user.id, Math.floor(Date.now() / 1000));
    await cacheService.invalidateUser(user.id);

    void enqueueEmail({ type: EMAIL_JOB_TYPES.SEND_PASSWORD_CHANGED, to: user.email });

    await auditService.log({
      userId: user.id,
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return { message: "Password reset successfully. Please log in with your new password." };
  }

  // ── Change Password ────────────────────────────────────────────────────────

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta = {}
  ): Promise<{ message: string }> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) throw new AuthenticationError("Current password is incorrect");

    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.valid) throw new ValidationError("Password does not meet requirements", strengthCheck.errors);

    await this.enforcePasswordHistory(user.id, newPassword);

    const passwordHash = await hashPassword(newPassword);
    await userRepository.updatePassword(user.id, passwordHash);
    await userRepository.addPasswordHistory(user.id, passwordHash, env.PASSWORD_HISTORY_LIMIT);

    // Revoke all other sessions
    await tokenService.revokeAllUserRefreshTokens(user.id);
    await cacheService.setUserRevocationTime(user.id, Math.floor(Date.now() / 1000));
    await cacheService.invalidateUser(user.id);

    void enqueueEmail({ type: EMAIL_JOB_TYPES.SEND_PASSWORD_CHANGED, to: user.email });

    await auditService.log({
      userId: user.id,
      action: AuditAction.PASSWORD_CHANGED,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return { message: "Password changed successfully. Please log in again." };
  }

  // ── Update Me ──────────────────────────────────────────────────────────────

  async updateMe(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      contact?: string;
      address?: string;
      dob?: Date;
      nid?: string;
    },
    meta: RequestMeta = {}
  ): Promise<UserResponse> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    try {
      const updated = await userRepository.update(userId, data);
      await cacheService.invalidateUser(userId);

      await auditService.log({
        userId,
        action: AuditAction.PROFILE_UPDATED,
        details: { fields: Object.keys(data) },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      });

      return toUserResponse(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("nid")) throw new ConflictError("NID is already registered to another account");
      throw err;
    }
  }

  // ── Get Me ─────────────────────────────────────────────────────────────────

  async getMe(userId: string): Promise<UserResponse> {
    const cached = await cacheService.getUser<UserResponse>(userId);
    if (cached) return cached;

    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    const response = toUserResponse(user);
    await cacheService.setUser(userId, response);
    return response;
  }

  // ── Admin: Get User ────────────────────────────────────────────────────────

  async getUser(userId: string): Promise<UserResponse> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");
    return toUserResponse(user);
  }

  async listUsers(options: {
    page: number;
    limit: number;
    role?: UserRole;
    isActive?: boolean;
  }): Promise<{ users: UserResponse[]; total: number }> {
    const { users, total } = await userRepository.findMany(options);
    return { users: users.map(toUserResponse), total };
  }

  async suspendUser(userId: string, adminId: string, meta: RequestMeta = {}): Promise<UserResponse> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");
    if (userId === adminId) throw new ValidationError("Cannot suspend your own account");

    const updated = await userRepository.update(userId, { isActive: false });
    await tokenService.revokeAllUserRefreshTokens(userId);
    await cacheService.setUserRevocationTime(userId, Math.floor(Date.now() / 1000));
    await cacheService.invalidateUser(userId);

    await auditService.log({
      userId: adminId,
      action: AuditAction.ACCOUNT_DEACTIVATED,
      details: { targetUserId: userId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return toUserResponse(updated);
  }

  async activateUser(userId: string, adminId: string, meta: RequestMeta = {}): Promise<UserResponse> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    const updated = await userRepository.update(userId, { isActive: true });
    await cacheService.invalidateUser(userId);

    await auditService.log({
      userId: adminId,
      action: AuditAction.ACCOUNT_UNLOCKED,
      details: { targetUserId: userId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return toUserResponse(updated);
  }

  async forceActivateUser(userId: string, adminId: string, adminPassword: string, meta: RequestMeta = {}): Promise<UserResponse> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");
    if (user.isVerified) throw new ValidationError("User is already verified; use the activate endpoint instead");

    const admin = await userRepository.findById(adminId);
    if (!admin) throw new NotFoundError("Admin not found");
    const passwordValid = await comparePassword(adminPassword, admin.passwordHash);
    if (!passwordValid) throw new AuthenticationError("Incorrect password");

    const updated = await userRepository.update(userId, {
      isActive: true,
      isVerified: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    await tokenService.invalidateAllEmailVerificationTokens(userId);
    await cacheService.invalidateUser(userId);

    await auditService.log({
      userId: adminId,
      action: AuditAction.ADMIN_FORCE_ACTIVATED,
      details: { targetUserId: userId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return toUserResponse(updated);
  }

  async updateUser(
    userId: string,
    adminId: string,
    data: {
      role?: UserRole; isActive?: boolean;
      firstName?: string; lastName?: string; contact?: string;
      address?: string; dob?: Date; nid?: string;
      designation?: string; department?: string; position?: string; identifierNumber?: string;
    },
    meta: RequestMeta = {}
  ): Promise<UserResponse> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");
    if (userId === adminId && data.isActive === false) {
      throw new ValidationError("Cannot deactivate your own account");
    }

    const updated = await userRepository.update(userId, data);

    if (data.isActive === false) {
      await tokenService.revokeAllUserRefreshTokens(userId);
      await cacheService.setUserRevocationTime(userId, Math.floor(Date.now() / 1000));
    }
    await cacheService.invalidateUser(userId);

    await auditService.log({
      userId: adminId,
      action: AuditAction.USER_UPDATED,
      details: { targetUserId: userId, changes: data },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return toUserResponse(updated);
  }

  async deleteUser(userId: string, adminId: string, meta: RequestMeta = {}): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");
    if (userId === adminId) throw new ValidationError("Cannot delete your own account");

    await userRepository.delete(userId);
    await cacheService.invalidateUser(userId);

    await auditService.log({
      userId: adminId,
      action: AuditAction.ACCOUNT_DELETED,
      details: { targetUserId: userId, email: user.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  // ── Internal / S2S ─────────────────────────────────────────────────────────

  async verifyTokenInternal(accessToken: string): Promise<UserResponse | null> {
    try {
      const payload = verifyAccessToken(accessToken);
      const revoked = await tokenService.isAccessTokenRevoked(
        payload.jti,
        payload.userId,
        payload.iat ?? 0
      );
      if (revoked) return null;
      return await this.getMe(payload.userId);
    } catch {
      return null;
    }
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private async issueTokens(
    user: User,
    meta: RequestMeta
  ): Promise<AuthTokens> {
    const jti = uuidv4();

    const accessPayload: AccessTokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      type: "access",
      jti,
    };

    const refreshPayload: RefreshTokenPayload = {
      userId: user.id,
      tokenId: uuidv4(),
      type: "refresh",
    };

    const accessToken = generateAccessToken(accessPayload);
    const rawRefreshToken = generateRefreshToken(refreshPayload);

    await tokenService.createRefreshToken(user.id, rawRefreshToken, meta);

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private async enforcePasswordHistory(userId: string, newPassword: string): Promise<void> {
    const history = await userRepository.getPasswordHistory(userId, env.PASSWORD_HISTORY_LIMIT);
    for (const oldHash of history) {
      const isSame = await comparePassword(newPassword, oldHash);
      if (isSame) {
        throw new ValidationError(
          `Password has been used recently. Please choose a different password.`
        );
      }
    }
  }
}

export const authService = new AuthService();
