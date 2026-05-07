import { AppStatus, NotificationEventType, SyncRequestStatus } from "@prisma/client";
import { appRepository, FeatureInput } from "@/repositories/app.repository";
import { userRepository } from "@/repositories/user.repository";
import { tokenService } from "@/services/token.service";
import { cacheService } from "@/services/cache.service";
import { auditService } from "@/services/audit.service";
import { notificationService } from "@/services/notification.service";
import { generateSecureToken, hashToken } from "@/utils/token.utils";
import { NotFoundError, ValidationError, AuthenticationError } from "@/utils/errors";
import { AuditAction } from "@/constants";
import { AppPermission } from "@/types";
import type { RequestMeta } from "@/services/auth.service";

export class AclService {
  // ── App Management ─────────────────────────────────────────────────────────

  async registerApp(
    data: { name: string; displayName: string; description?: string; allowedIps?: string[] },
    adminId: string,
    meta: RequestMeta = {}
  ): Promise<{ app: object; secret: string }> {
    const secret = generateSecureToken();
    const secretHash = hashToken(secret);

    const app = await appRepository.createApp({ ...data, secretHash, status: AppStatus.ACTIVE });

    await notificationService.dispatch(
      NotificationEventType.APP_REGISTRATION,
      app.id,
      `New app registered: "${app.displayName}"`,
      `App "${app.name}" was registered and is now active.`,
      { appId: app.id, createdBy: adminId }
    );

    await auditService.log({
      userId: adminId,
      action: AuditAction.APP_CREATED,
      details: { appId: app.id, appName: app.name },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    // Return raw secret only once — it is never retrievable again
    const { secretHash: _, ...safeApp } = app;
    return { app: safeApp, secret };
  }

  async listApps(options: { page: number; limit: number; status?: AppStatus }) {
    const { apps, total } = await appRepository.listApps(options);
    return { apps: apps.map(this.sanitizeApp), total };
  }

  async getApp(appId: string) {
    const app = await appRepository.findAppById(appId);
    if (!app) throw new NotFoundError("App not found");
    return this.sanitizeApp(app);
  }

  async updateApp(
    appId: string,
    data: { displayName?: string; description?: string; allowedIps?: string[] },
    adminId: string,
    meta: RequestMeta = {}
  ) {
    const app = await appRepository.findAppById(appId);
    if (!app) throw new NotFoundError("App not found");

    const updated = await appRepository.updateApp(appId, data);

    await auditService.log({
      userId: adminId,
      action: AuditAction.APP_UPDATED,
      details: { appId, changes: data },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return this.sanitizeApp(updated);
  }

  async suspendApp(appId: string, adminId: string, meta: RequestMeta = {}) {
    const app = await appRepository.findAppById(appId);
    if (!app) throw new NotFoundError("App not found");
    if (app.status === AppStatus.SUSPENDED) throw new ValidationError("App is already suspended");

    const updated = await appRepository.updateApp(appId, { status: AppStatus.SUSPENDED });

    await auditService.log({
      userId: adminId,
      action: AuditAction.APP_SUSPENDED,
      details: { appId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return this.sanitizeApp(updated);
  }

  async reactivateApp(appId: string, adminId: string, meta: RequestMeta = {}) {
    const app = await appRepository.findAppById(appId);
    if (!app) throw new NotFoundError("App not found");
    if (app.status === AppStatus.ACTIVE) throw new ValidationError("App is already active");

    const updated = await appRepository.updateApp(appId, { status: AppStatus.ACTIVE });

    await auditService.log({
      userId: adminId,
      action: AuditAction.APP_REACTIVATED,
      details: { appId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return this.sanitizeApp(updated);
  }

  async regenerateAppSecret(appId: string, adminId: string, meta: RequestMeta = {}): Promise<{ secret: string }> {
    const app = await appRepository.findAppById(appId);
    if (!app) throw new NotFoundError("App not found");

    const secret = generateSecureToken();
    const secretHash = hashToken(secret);
    await appRepository.updateApp(appId, { secretHash });

    await auditService.log({
      userId: adminId,
      action: AuditAction.APP_SECRET_REGENERATED,
      details: { appId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return { secret };
  }

  // ── Feature Management (admin-direct) ──────────────────────────────────────

  async addFeature(
    appId: string,
    data: FeatureInput,
    adminId: string,
    meta: RequestMeta = {}
  ) {
    const app = await appRepository.findAppById(appId);
    if (!app) throw new NotFoundError("App not found");

    const feature = await appRepository.createFeature(appId, data);

    await auditService.log({
      userId: adminId,
      action: AuditAction.FEATURE_ADDED,
      details: { appId, featureId: feature.id, key: feature.key },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return feature;
  }

  async updateFeature(
    featureId: string,
    data: { displayName?: string; description?: string },
    adminId: string,
    meta: RequestMeta = {}
  ) {
    const feature = await appRepository.findFeatureById(featureId);
    if (!feature) throw new NotFoundError("Feature not found");

    const updated = await appRepository.updateFeature(featureId, data);

    await auditService.log({
      userId: adminId,
      action: AuditAction.FEATURE_UPDATED,
      details: { featureId, changes: data },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return updated;
  }

  async removeFeature(featureId: string, adminId: string, meta: RequestMeta = {}): Promise<void> {
    const feature = await appRepository.findFeatureById(featureId);
    if (!feature) throw new NotFoundError("Feature not found");

    await appRepository.deleteFeature(featureId);

    await auditService.log({
      userId: adminId,
      action: AuditAction.FEATURE_REMOVED,
      details: { featureId, key: feature.key },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  async listFeatures(appId: string) {
    const app = await appRepository.findAppById(appId);
    if (!app) throw new NotFoundError("App not found");
    return appRepository.listFeatures(appId);
  }

  // ── Feature Sync (app-initiated via secret) ────────────────────────────────

  async submitFeatureSync(
    rawSecret: string,
    features: FeatureInput[]
  ) {
    const secretHash = hashToken(rawSecret);
    const app = await appRepository.findActiveAppBySecretHash(secretHash);
    if (!app) throw new AuthenticationError("Invalid app secret or app is not active");

    if (features.length === 0) throw new ValidationError("Feature list cannot be empty");

    const request = await appRepository.createSyncRequest(app.id, features);

    await notificationService.dispatch(
      NotificationEventType.FEATURE_SYNC,
      app.id,
      `Feature sync requested: "${app.displayName}"`,
      `${features.length} feature(s) submitted for review.`,
      { requestId: request.id, appId: app.id, featureCount: features.length }
    );

    return request;
  }

  async listSyncRequests(options: {
    page: number;
    limit: number;
    appId?: string;
    status?: SyncRequestStatus;
  }) {
    return appRepository.listSyncRequests(options);
  }

  async approveSyncRequest(requestId: string, adminId: string, meta: RequestMeta = {}) {
    const request = await appRepository.findSyncRequestById(requestId);
    if (!request) throw new NotFoundError("Sync request not found");
    if (request.status !== SyncRequestStatus.PENDING) {
      throw new ValidationError("Sync request is no longer pending");
    }

    const features = request.features as unknown as FeatureInput[];

    // Upsert all submitted features into the Feature table
    for (const f of features) {
      await appRepository.upsertFeature(request.appId, f);
    }

    await appRepository.updateSyncRequest(requestId, {
      status: SyncRequestStatus.APPROVED,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    });

    await auditService.log({
      userId: adminId,
      action: AuditAction.SYNC_REQUEST_APPROVED,
      details: { requestId, appId: request.appId, featureCount: features.length },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return appRepository.findSyncRequestById(requestId);
  }

  async rejectSyncRequest(requestId: string, adminId: string, meta: RequestMeta = {}) {
    const request = await appRepository.findSyncRequestById(requestId);
    if (!request) throw new NotFoundError("Sync request not found");
    if (request.status !== SyncRequestStatus.PENDING) {
      throw new ValidationError("Sync request is no longer pending");
    }

    await appRepository.updateSyncRequest(requestId, {
      status: SyncRequestStatus.REJECTED,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    });

    await auditService.log({
      userId: adminId,
      action: AuditAction.SYNC_REQUEST_REJECTED,
      details: { requestId, appId: request.appId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return appRepository.findSyncRequestById(requestId);
  }

  // ── Role Management ────────────────────────────────────────────────────────

  async createRole(
    appId: string,
    data: { name: string; displayName: string; description?: string; isDefault?: boolean },
    adminId: string,
    meta: RequestMeta = {}
  ) {
    const app = await appRepository.findAppById(appId);
    if (!app) throw new NotFoundError("App not found");

    const role = await appRepository.createRole({ appId, ...data });

    await auditService.log({
      userId: adminId,
      action: AuditAction.ROLE_CREATED,
      details: { appId, roleId: role.id, roleName: role.name },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return role;
  }

  async listRoles(appId: string) {
    const app = await appRepository.findAppById(appId);
    if (!app) throw new NotFoundError("App not found");
    return appRepository.listRoles(appId);
  }

  async updateRole(
    roleId: string,
    data: { displayName?: string; description?: string; isDefault?: boolean },
    adminId: string,
    meta: RequestMeta = {}
  ) {
    const role = await appRepository.findRoleById(roleId);
    if (!role) throw new NotFoundError("Role not found");

    // Bump version and update
    const updated = await appRepository.updateRole(roleId, { ...data, version: role.version + 1 });

    // Invalidate sessions of all users with this role
    await this.invalidateRoleUsers(roleId);

    await notificationService.dispatch(
      NotificationEventType.ROLE_MODIFIED,
      role.appId,
      `Role modified: "${updated.displayName}"`,
      `The role definition was updated. Affected users have been signed out to receive new permissions.`,
      { roleId, appId: role.appId, changes: data }
    );

    await auditService.log({
      userId: adminId,
      action: AuditAction.ROLE_UPDATED,
      details: { roleId, appId: role.appId, changes: data },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return updated;
  }

  async deleteRole(roleId: string, adminId: string, meta: RequestMeta = {}): Promise<void> {
    const role = await appRepository.findRoleById(roleId);
    if (!role) throw new NotFoundError("Role not found");

    // Unassign users from this role before deletion
    await this.invalidateRoleUsers(roleId);

    await appRepository.deleteRole(roleId);

    await auditService.log({
      userId: adminId,
      action: AuditAction.ROLE_DELETED,
      details: { roleId, appId: role.appId, roleName: role.name },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  async setRoleFeatures(
    roleId: string,
    featureIds: string[],
    adminId: string,
    meta: RequestMeta = {}
  ) {
    const role = await appRepository.findRoleById(roleId);
    if (!role) throw new NotFoundError("Role not found");

    await appRepository.setRoleFeatures(roleId, featureIds);

    // Bump version + invalidate users since feature set changed
    const updated = await appRepository.updateRole(roleId, { version: role.version + 1 });
    await this.invalidateRoleUsers(roleId);

    await notificationService.dispatch(
      NotificationEventType.ROLE_MODIFIED,
      role.appId,
      `Role features updated: "${role.displayName}"`,
      `The feature set for this role was changed. Affected users have been signed out.`,
      { roleId, appId: role.appId, featureCount: featureIds.length }
    );

    await auditService.log({
      userId: adminId,
      action: AuditAction.ROLE_FEATURES_SET,
      details: { roleId, appId: role.appId, featureIds },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return updated;
  }

  // ── User-App Access ────────────────────────────────────────────────────────

  async assignUserToApp(
    userId: string,
    appId: string,
    roleId: string | undefined,
    adminId: string,
    meta: RequestMeta = {}
  ) {
    const [user, app] = await Promise.all([
      userRepository.findById(userId),
      appRepository.findAppById(appId),
    ]);
    if (!user) throw new NotFoundError("User not found");
    if (!app) throw new NotFoundError("App not found");
    if (app.status !== AppStatus.ACTIVE) throw new ValidationError("Cannot assign users to an inactive app");

    if (roleId) {
      const role = await appRepository.findRoleById(roleId);
      if (!role || role.appId !== appId) throw new ValidationError("Role does not belong to this app");
    }

    const userApp = await appRepository.createUserApp({ userId, appId, roleId, grantedBy: adminId });

    await notificationService.dispatch(
      NotificationEventType.USER_ACCESS_GRANTED,
      appId,
      `User granted access: "${app.displayName}"`,
      `User ${user.email} was granted access to ${app.displayName}.`,
      { userId, appId, roleId }
    );

    await auditService.log({
      userId: adminId,
      action: AuditAction.USER_APP_ASSIGNED,
      details: { targetUserId: userId, appId, roleId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return userApp;
  }

  async updateUserAppAccess(
    userId: string,
    appId: string,
    data: { roleId?: string | null; isActive?: boolean },
    adminId: string,
    meta: RequestMeta = {}
  ) {
    const userApp = await appRepository.findUserApp(userId, appId);
    if (!userApp) throw new NotFoundError("User does not have access to this app");

    if (data.roleId) {
      const role = await appRepository.findRoleById(data.roleId);
      if (!role || role.appId !== appId) throw new ValidationError("Role does not belong to this app");
    }

    const updated = await appRepository.updateUserApp(userId, appId, data);

    // Invalidate user session so they pick up new role immediately
    await this.invalidateUserSession(userId);

    await auditService.log({
      userId: adminId,
      action: AuditAction.USER_APP_UPDATED,
      details: { targetUserId: userId, appId, changes: data },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return updated;
  }

  async removeUserFromApp(
    userId: string,
    appId: string,
    adminId: string,
    meta: RequestMeta = {}
  ): Promise<void> {
    const userApp = await appRepository.findUserApp(userId, appId);
    if (!userApp) throw new NotFoundError("User does not have access to this app");

    await appRepository.deleteUserApp(userId, appId);
    await this.invalidateUserSession(userId);

    const app = await appRepository.findAppById(appId);

    await notificationService.dispatch(
      NotificationEventType.USER_ACCESS_REVOKED,
      appId,
      `User access revoked: "${app?.displayName ?? appId}"`,
      `User's access to ${app?.displayName ?? appId} has been revoked.`,
      { userId, appId }
    );

    await auditService.log({
      userId: adminId,
      action: AuditAction.USER_APP_REMOVED,
      details: { targetUserId: userId, appId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  async setUserDirectFeatures(
    userId: string,
    appId: string,
    overrides: { featureId: string; granted: boolean }[],
    adminId: string,
    meta: RequestMeta = {}
  ) {
    const userApp = await appRepository.findUserApp(userId, appId);
    if (!userApp) throw new NotFoundError("User does not have access to this app");

    await appRepository.setUserDirectFeatures(userApp.id, overrides);
    await this.invalidateUserSession(userId);

    await auditService.log({
      userId: adminId,
      action: AuditAction.USER_FEATURES_SET,
      details: { targetUserId: userId, appId, overrides },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  async listAppUsers(
    appId: string,
    options: { page: number; limit: number; isActive?: boolean }
  ) {
    const app = await appRepository.findAppById(appId);
    if (!app) throw new NotFoundError("App not found");
    return appRepository.listAppUsers(appId, options);
  }

  // ── Permission Resolution (internal / JWT) ────────────────────────────────

  async getUserPermissionsForApp(
    userId: string,
    appId: string,
    jwtPermission?: { roleVersion: number }
  ): Promise<{ permission: AppPermission | null; permissionsStale: boolean }> {
    const permission = await appRepository.resolveUserPermissionsForApp(userId, appId);
    if (!permission) return { permission: null, permissionsStale: false };

    // Check if the JWT's cached roleVersion is stale
    const permissionsStale = jwtPermission !== undefined
      ? jwtPermission.roleVersion !== permission.roleVersion
      : false;

    return { permission, permissionsStale };
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private async invalidateRoleUsers(roleId: string): Promise<void> {
    const userIds = await appRepository.getUserIdsByRole(roleId);
    await Promise.all(
      userIds.map((userId) => this.invalidateUserSession(userId))
    );
  }

  private async invalidateUserSession(userId: string): Promise<void> {
    await Promise.all([
      tokenService.revokeAllUserRefreshTokens(userId),
      cacheService.setUserRevocationTime(userId, Math.floor(Date.now() / 1000)),
      cacheService.invalidateUser(userId),
    ]);
  }

  private sanitizeApp(app: { secretHash: string; [key: string]: unknown }) {
    const { secretHash: _, ...safe } = app;
    return safe;
  }
}

export const aclService = new AclService();
