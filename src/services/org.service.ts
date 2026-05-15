import { Organization, AuthMode, OrgStatus, OrgMemberRole, OrgPlan } from "@prisma/client";
import { orgRepository } from "@/repositories/org.repository";
import { userRepository } from "@/repositories/user.repository";
import { appRepository } from "@/repositories/app.repository";
import { auditService } from "@/services/audit.service";
import { cacheService } from "@/services/cache.service";
import { PLAN_LIMITS } from "@/constants/plans.constants";
import { generateSecureToken, hashToken } from "@/utils/token.utils";
import { hashPassword, comparePassword, validatePasswordStrength } from "@/utils/password.utils";
import {
  NotFoundError,
  ConflictError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from "@/utils/errors";
import { AuditAction } from "@/constants";
import { RequestMeta } from "@/services/auth.service";
import { UserResponse } from "@/types";
import { User } from "@prisma/client";

function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    role: user.role as any,
    isVerified: user.isVerified,
    isActive: user.isActive,
    organizationId: user.organizationId,
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

export class OrgService {
  // ── Admin: Org CRUD ────────────────────────────────────────────────────────

  async createOrg(
    data: { name: string; displayName: string; description?: string; authMode?: AuthMode },
    adminUserId: string,
    meta: RequestMeta = {}
  ): Promise<{ org: Omit<Organization, "secretHash">; secret: string }> {
    const existing = await orgRepository.findByName(data.name);
    if (existing) throw new ConflictError("An organization with this name already exists");

    const secret = generateSecureToken(32);
    const secretHash = hashToken(secret);

    const org = await orgRepository.create({ ...data, secretHash });

    await auditService.log({
      userId: adminUserId,
      action: AuditAction.ORG_CREATED,
      details: { orgId: org.id, name: org.name },
      ...meta,
    });

    const { secretHash: _, ...safeOrg } = org;
    return { org: safeOrg, secret };
  }

  async listOrgs(params: { page: number; limit: number; status?: OrgStatus }) {
    return orgRepository.list(params);
  }

  async getOrg(orgId: string): Promise<Omit<Organization, "secretHash"> & { stats: { userCount: number; appCount: number; memberCount: number } }> {
    const org = await orgRepository.findById(orgId);
    if (!org) throw new NotFoundError("Organization not found");
    const stats = await orgRepository.getStats(orgId);
    const { secretHash: _, ...safeOrg } = org;
    return { ...safeOrg, stats };
  }

  async updateOrg(
    orgId: string,
    data: { displayName?: string; description?: string; authMode?: AuthMode },
    adminUserId: string,
    meta: RequestMeta = {}
  ): Promise<Omit<Organization, "secretHash">> {
    const org = await orgRepository.findById(orgId);
    if (!org) throw new NotFoundError("Organization not found");

    const updated = await orgRepository.update(orgId, data);

    await auditService.log({
      userId: adminUserId,
      action: AuditAction.ORG_UPDATED,
      details: { orgId, changes: data },
      ...meta,
    });

    const { secretHash: _, ...safeOrg } = updated;
    return safeOrg;
  }

  async suspendOrg(orgId: string, adminUserId: string, meta: RequestMeta = {}) {
    const org = await orgRepository.findById(orgId);
    if (!org) throw new NotFoundError("Organization not found");
    if (org.isDefault) throw new ValidationError("Cannot suspend the default organization");

    await orgRepository.setStatus(orgId, OrgStatus.SUSPENDED);

    await auditService.log({
      userId: adminUserId,
      action: AuditAction.ORG_SUSPENDED,
      details: { orgId },
      ...meta,
    });
  }

  async reactivateOrg(orgId: string, adminUserId: string, meta: RequestMeta = {}) {
    const org = await orgRepository.findById(orgId);
    if (!org) throw new NotFoundError("Organization not found");

    await orgRepository.setStatus(orgId, OrgStatus.ACTIVE);

    await auditService.log({
      userId: adminUserId,
      action: AuditAction.ORG_REACTIVATED,
      details: { orgId },
      ...meta,
    });
  }

  async regenerateSecret(orgId: string, adminUserId: string, meta: RequestMeta = {}): Promise<{ secret: string }> {
    const org = await orgRepository.findById(orgId);
    if (!org) throw new NotFoundError("Organization not found");
    if (org.isDefault) throw new ValidationError("Cannot regenerate secret for the default organization");

    const secret = generateSecureToken(32);
    const secretHash = hashToken(secret);

    await orgRepository.updateSecret(orgId, secretHash);

    await auditService.log({
      userId: adminUserId,
      action: AuditAction.ORG_SECRET_REGENERATED,
      details: { orgId },
      ...meta,
    });

    return { secret };
  }

  // ── Admin: Org member management ───────────────────────────────────────────

  async addMember(orgId: string, userId: string, role: OrgMemberRole, adminUserId: string, meta: RequestMeta = {}) {
    const [org, user] = await Promise.all([
      orgRepository.findById(orgId),
      userRepository.findById(userId),
    ]);
    if (!org) throw new NotFoundError("Organization not found");
    if (!user) throw new NotFoundError("User not found");

    const member = await orgRepository.addMember(orgId, userId, role);

    await auditService.log({
      userId: adminUserId,
      action: AuditAction.ORG_MEMBER_ADDED,
      details: { orgId, userId, role },
      ...meta,
    });

    return member;
  }

  async removeMember(orgId: string, userId: string, adminUserId: string, meta: RequestMeta = {}) {
    const member = await orgRepository.findMember(orgId, userId);
    if (!member) throw new NotFoundError("Member not found in this organization");

    await orgRepository.removeMember(orgId, userId);

    await auditService.log({
      userId: adminUserId,
      action: AuditAction.ORG_MEMBER_REMOVED,
      details: { orgId, userId },
      ...meta,
    });
  }

  async listMembers(orgId: string) {
    const org = await orgRepository.findById(orgId);
    if (!org) throw new NotFoundError("Organization not found");
    return orgRepository.listMembers(orgId);
  }

  // ── Admin: list org apps ───────────────────────────────────────────────────

  async listOrgApps(orgId: string, params: { page: number; limit: number }) {
    const org = await orgRepository.findById(orgId);
    if (!org) throw new NotFoundError("Organization not found");
    return appRepository.listApps({ ...params, organizationId: orgId });
  }

  // ── Admin: list org users ──────────────────────────────────────────────────

  async listOrgUsers(orgId: string, params: { page: number; limit: number; search?: string }) {
    const org = await orgRepository.findById(orgId);
    if (!org) throw new NotFoundError("Organization not found");
    return orgRepository.listUsers(orgId, params);
  }

  // ── Org admin: self-service operations ────────────────────────────────────

  async getMyOrg(orgId: string) {
    return this.getOrg(orgId);
  }

  async updateMyOrg(orgId: string, data: { displayName?: string; description?: string; authMode?: AuthMode }, userId: string, meta: RequestMeta = {}) {
    return this.updateOrg(orgId, data, userId, meta);
  }

  async getUsageStats(orgId: string) {
    const org = await orgRepository.findById(orgId);
    if (!org) throw new NotFoundError("Organization not found");

    const limits = PLAN_LIMITS[org.plan as OrgPlan];
    const stats = await orgRepository.getStats(orgId);
    const [mauThisMonth, apiCallsToday] = await Promise.all([
      cacheService.getMau(orgId),
      cacheService.getApiCallsToday(orgId),
    ]);

    return {
      plan: org.plan,
      limits,
      usage: {
        mauThisMonth,
        apiCallsToday,
        appCount: stats.appCount,
        webhookCount: 0,
        apiKeyCount: 0,
        oauthAppCount: 0,
      },
    };
  }

  // ── Public Org API: authenticate org secret ────────────────────────────────

  async authenticateOrgSecret(rawSecret: string): Promise<Organization> {
    const secretHash = hashToken(rawSecret);
    const org = await orgRepository.findBySecretHash(secretHash);
    if (!org) throw new AuthenticationError("Invalid organization secret");
    if (org.status === OrgStatus.SUSPENDED) throw new AuthorizationError("Organization is suspended");
    return org;
  }

  // ── Public Org API: register end user ─────────────────────────────────────

  async orgRegisterUser(
    org: Organization,
    data: {
      email: string;
      password?: string;
      firstName?: string;
      lastName?: string;
      mode?: "full" | "delegated";
    },
    meta: RequestMeta = {}
  ): Promise<{ user: UserResponse }> {
    const effectiveMode = data.mode ?? (org.authMode === AuthMode.FULL ? "full" : org.authMode === AuthMode.DELEGATED ? "delegated" : "full");

    // Validate auth mode against org setting
    if (org.authMode === AuthMode.FULL && effectiveMode === "delegated") {
      throw new ValidationError("This organization does not support delegated authentication");
    }
    if (org.authMode === AuthMode.DELEGATED && effectiveMode === "full") {
      throw new ValidationError("This organization does not support full authentication");
    }

    const existing = await orgRepository.findUserByEmailInOrg(org.id, data.email);
    if (existing) throw new ConflictError("A user with this email already exists in this organization");

    let passwordHash: string;
    if (effectiveMode === "full") {
      if (!data.password) throw new ValidationError("Password is required for full authentication mode");
      const { valid, errors } = validatePasswordStrength(data.password);
      if (!valid) throw new ValidationError("Password does not meet requirements", errors);
      passwordHash = await hashPassword(data.password);
    } else {
      // Delegated: store a random unusable hash
      passwordHash = await hashPassword(generateSecureToken(32));
    }

    const user = await userRepository.create({
      email: data.email,
      passwordHash,
      organizationId: org.id,
      firstName: data.firstName,
      lastName: data.lastName,
    });

    // Auto-verify and activate for org-registered users
    await userRepository.update(user.id, { isVerified: true, isActive: true });

    await auditService.log({
      userId: user.id,
      action: AuditAction.ORG_USER_REGISTERED,
      details: { orgId: org.id, mode: effectiveMode },
      ...meta,
    });

    return { user: toUserResponse({ ...user, isVerified: true, isActive: true }) };
  }

  // ── Public Org API: login end user ────────────────────────────────────────

  async orgLoginUser(
    org: Organization,
    data: {
      email: string;
      password?: string;
      mode?: "full" | "delegated";
    },
    meta: RequestMeta = {}
  ): Promise<{ user: UserResponse }> {
    const effectiveMode = data.mode ?? (org.authMode === AuthMode.FULL ? "full" : org.authMode === AuthMode.DELEGATED ? "delegated" : "full");

    if (org.authMode === AuthMode.FULL && effectiveMode === "delegated") {
      throw new ValidationError("This organization does not support delegated authentication");
    }
    if (org.authMode === AuthMode.DELEGATED && effectiveMode === "full") {
      throw new ValidationError("This organization does not support full authentication");
    }

    const user = await orgRepository.findUserByEmailInOrg(org.id, data.email);
    if (!user) throw new AuthenticationError("Invalid credentials");
    if (!user.isActive) throw new AuthorizationError("Account is suspended");

    if (effectiveMode === "full") {
      if (!data.password) throw new ValidationError("Password is required");
      const valid = await comparePassword(data.password, user.passwordHash);
      if (!valid) throw new AuthenticationError("Invalid credentials");
    }
    // In delegated mode: the org validated credentials themselves, we trust the call

    await auditService.log({
      userId: user.id,
      action: AuditAction.ORG_USER_LOGIN,
      details: { orgId: org.id, mode: effectiveMode },
      ...meta,
    });

    return { user: toUserResponse(user) };
  }
}

export const orgService = new OrgService();
