import {
  PrismaClient,
  App,
  Feature,
  AppRole,
  UserApp,
  UserFeature,
  FeatureSyncRequest,
  AppStatus,
  SyncRequestStatus,
  Prisma,
} from "@prisma/client";
import { getPrismaClient } from "@/config/database";
import { DatabaseError } from "@/utils/errors";
import { AppPermission } from "@/types";

export interface FeatureInput {
  key: string;
  displayName: string;
  description?: string;
}

export class AppRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  // ── Apps ──────────────────────────────────────────────────────────────────

  async createApp(data: {
    name: string;
    displayName: string;
    description?: string;
    secretHash: string;
    allowedIps?: string[];
    status?: AppStatus;
    organizationId: string;
  }): Promise<App> {
    try {
      return await this.prisma.app.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new DatabaseError("An app with that name already exists");
      }
      throw new DatabaseError("Failed to create app");
    }
  }

  async findAppById(id: string): Promise<App | null> {
    try {
      return await this.prisma.app.findUnique({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to find app");
    }
  }

  async findAppByName(name: string): Promise<App | null> {
    try {
      return await this.prisma.app.findUnique({ where: { name } });
    } catch {
      throw new DatabaseError("Failed to find app by name");
    }
  }

  async findActiveAppBySecretHash(secretHash: string): Promise<App | null> {
    try {
      return await this.prisma.app.findFirst({
        where: { secretHash, status: AppStatus.ACTIVE },
      });
    } catch {
      throw new DatabaseError("Failed to look up app by secret");
    }
  }

  async listApps(options: {
    page: number;
    limit: number;
    status?: AppStatus;
    organizationId?: string;
  }): Promise<{ apps: App[]; total: number }> {
    const skip = (options.page - 1) * options.limit;
    const where: Prisma.AppWhereInput = {};
    if (options.status) where.status = options.status;
    if (options.organizationId) where.organizationId = options.organizationId;
    try {
      const [apps, total] = await this.prisma.$transaction([
        this.prisma.app.findMany({ where, skip, take: options.limit, orderBy: { createdAt: "desc" } }),
        this.prisma.app.count({ where }),
      ]);
      return { apps, total };
    } catch {
      throw new DatabaseError("Failed to list apps");
    }
  }

  async updateApp(id: string, data: Partial<Pick<App, "displayName" | "description" | "secretHash" | "status" | "allowedIps">>): Promise<App> {
    try {
      return await this.prisma.app.update({ where: { id }, data });
    } catch {
      throw new DatabaseError("Failed to update app");
    }
  }

  async deleteApp(id: string): Promise<void> {
    try {
      await this.prisma.app.delete({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to delete app");
    }
  }

  // ── Features ──────────────────────────────────────────────────────────────

  async upsertFeature(appId: string, data: FeatureInput): Promise<Feature> {
    try {
      return await this.prisma.feature.upsert({
        where: { appId_key: { appId, key: data.key } },
        create: { appId, ...data },
        update: { displayName: data.displayName, description: data.description },
      });
    } catch {
      throw new DatabaseError("Failed to upsert feature");
    }
  }

  async createFeature(appId: string, data: FeatureInput): Promise<Feature> {
    try {
      return await this.prisma.feature.create({ data: { appId, ...data } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new DatabaseError("A feature with that key already exists for this app");
      }
      throw new DatabaseError("Failed to create feature");
    }
  }

  async findFeatureById(id: string): Promise<Feature | null> {
    try {
      return await this.prisma.feature.findUnique({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to find feature");
    }
  }

  async listFeatures(appId: string): Promise<Feature[]> {
    try {
      return await this.prisma.feature.findMany({ where: { appId }, orderBy: { key: "asc" } });
    } catch {
      throw new DatabaseError("Failed to list features");
    }
  }

  async updateFeature(id: string, data: Partial<Pick<Feature, "displayName" | "description">>): Promise<Feature> {
    try {
      return await this.prisma.feature.update({ where: { id }, data });
    } catch {
      throw new DatabaseError("Failed to update feature");
    }
  }

  async deleteFeature(id: string): Promise<void> {
    try {
      await this.prisma.feature.delete({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to delete feature");
    }
  }

  // ── Feature Sync Requests ─────────────────────────────────────────────────

  async createSyncRequest(appId: string, features: FeatureInput[]): Promise<FeatureSyncRequest> {
    try {
      return await this.prisma.featureSyncRequest.create({
        data: { appId, features: features as unknown as Prisma.InputJsonValue },
      });
    } catch {
      throw new DatabaseError("Failed to create sync request");
    }
  }

  async findSyncRequestById(id: string): Promise<FeatureSyncRequest | null> {
    try {
      return await this.prisma.featureSyncRequest.findUnique({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to find sync request");
    }
  }

  async listSyncRequests(options: {
    page: number;
    limit: number;
    appId?: string;
    status?: SyncRequestStatus;
  }): Promise<{ requests: FeatureSyncRequest[]; total: number }> {
    const skip = (options.page - 1) * options.limit;
    const where: Prisma.FeatureSyncRequestWhereInput = {};
    if (options.appId) where.appId = options.appId;
    if (options.status) where.status = options.status;
    try {
      const [requests, total] = await this.prisma.$transaction([
        this.prisma.featureSyncRequest.findMany({ where, skip, take: options.limit, orderBy: { createdAt: "desc" } }),
        this.prisma.featureSyncRequest.count({ where }),
      ]);
      return { requests, total };
    } catch {
      throw new DatabaseError("Failed to list sync requests");
    }
  }

  async updateSyncRequest(
    id: string,
    data: { status: SyncRequestStatus; reviewedBy: string; reviewedAt: Date }
  ): Promise<FeatureSyncRequest> {
    try {
      return await this.prisma.featureSyncRequest.update({ where: { id }, data });
    } catch {
      throw new DatabaseError("Failed to update sync request");
    }
  }

  // ── Roles ─────────────────────────────────────────────────────────────────

  async createRole(data: {
    appId: string;
    name: string;
    displayName: string;
    description?: string;
    isDefault?: boolean;
  }): Promise<AppRole> {
    try {
      return await this.prisma.appRole.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new DatabaseError("A role with that name already exists for this app");
      }
      throw new DatabaseError("Failed to create role");
    }
  }

  async findRoleById(id: string): Promise<AppRole | null> {
    try {
      return await this.prisma.appRole.findUnique({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to find role");
    }
  }

  async listRoles(appId: string): Promise<AppRole[]> {
    try {
      return await this.prisma.appRole.findMany({ where: { appId }, orderBy: { name: "asc" } });
    } catch {
      throw new DatabaseError("Failed to list roles");
    }
  }

  async updateRole(
    id: string,
    data: Partial<Pick<AppRole, "displayName" | "description" | "isDefault" | "version">>
  ): Promise<AppRole> {
    try {
      return await this.prisma.appRole.update({ where: { id }, data });
    } catch {
      throw new DatabaseError("Failed to update role");
    }
  }

  async deleteRole(id: string): Promise<void> {
    try {
      await this.prisma.appRole.delete({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to delete role");
    }
  }

  async setRoleFeatures(roleId: string, featureIds: string[]): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.roleFeature.deleteMany({ where: { roleId } }),
        ...(featureIds.length > 0
          ? [this.prisma.roleFeature.createMany({
              data: featureIds.map((featureId) => ({ roleId, featureId })),
            })]
          : []),
      ]);
    } catch {
      throw new DatabaseError("Failed to set role features");
    }
  }

  async getRoleFeatureKeys(roleId: string): Promise<string[]> {
    try {
      const rows = await this.prisma.roleFeature.findMany({
        where: { roleId },
        include: { feature: { select: { key: true } } },
      });
      return rows.map((r) => r.feature.key);
    } catch {
      throw new DatabaseError("Failed to get role features");
    }
  }

  async getRoleFeatureIds(roleId: string): Promise<string[]> {
    try {
      const rows = await this.prisma.roleFeature.findMany({ where: { roleId }, select: { featureId: true } });
      return rows.map((r) => r.featureId);
    } catch {
      throw new DatabaseError("Failed to get role features");
    }
  }

  async getUserIdsByRole(roleId: string): Promise<string[]> {
    try {
      const rows = await this.prisma.userApp.findMany({
        where: { roleId, isActive: true },
        select: { userId: true },
      });
      return rows.map((r) => r.userId);
    } catch {
      throw new DatabaseError("Failed to get users by role");
    }
  }

  // ── UserApp ───────────────────────────────────────────────────────────────

  async findUserApp(userId: string, appId: string): Promise<UserApp | null> {
    try {
      return await this.prisma.userApp.findUnique({ where: { userId_appId: { userId, appId } } });
    } catch {
      throw new DatabaseError("Failed to find user app");
    }
  }

  async createUserApp(data: {
    userId: string;
    appId: string;
    roleId?: string;
    grantedBy?: string;
  }): Promise<UserApp> {
    try {
      return await this.prisma.userApp.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new DatabaseError("User already has access to this app");
      }
      throw new DatabaseError("Failed to assign user to app");
    }
  }

  async updateUserApp(
    userId: string,
    appId: string,
    data: Partial<Pick<UserApp, "roleId" | "isActive">>
  ): Promise<UserApp> {
    try {
      return await this.prisma.userApp.update({
        where: { userId_appId: { userId, appId } },
        data,
      });
    } catch {
      throw new DatabaseError("Failed to update user app");
    }
  }

  async deleteUserApp(userId: string, appId: string): Promise<void> {
    try {
      await this.prisma.userApp.delete({ where: { userId_appId: { userId, appId } } });
    } catch {
      throw new DatabaseError("Failed to remove user from app");
    }
  }

  async listAppUsers(
    appId: string,
    options: { page: number; limit: number; isActive?: boolean }
  ): Promise<{ userApps: (UserApp & { user: { id: string; email: string; firstName: string | null; lastName: string | null } })[]; total: number }> {
    const skip = (options.page - 1) * options.limit;
    const where: Prisma.UserAppWhereInput = { appId };
    if (options.isActive !== undefined) where.isActive = options.isActive;
    try {
      const [userApps, total] = await this.prisma.$transaction([
        this.prisma.userApp.findMany({
          where,
          skip,
          take: options.limit,
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.userApp.count({ where }),
      ]);
      return { userApps: userApps as any, total };
    } catch {
      throw new DatabaseError("Failed to list app users");
    }
  }

  // ── UserFeature (direct overrides) ────────────────────────────────────────

  async setUserDirectFeatures(
    userAppId: string,
    overrides: { featureId: string; granted: boolean }[]
  ): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.userFeature.deleteMany({ where: { userAppId } }),
        ...(overrides.length > 0
          ? [this.prisma.userFeature.createMany({
              data: overrides.map(({ featureId, granted }) => ({ userAppId, featureId, granted })),
            })]
          : []),
      ]);
    } catch {
      throw new DatabaseError("Failed to set user direct features");
    }
  }

  async getUserDirectFeatures(userAppId: string): Promise<UserFeature[]> {
    try {
      return await this.prisma.userFeature.findMany({ where: { userAppId } });
    } catch {
      throw new DatabaseError("Failed to get user direct features");
    }
  }

  // ── Permission Resolution (used for JWT and internal verify) ──────────────

  async resolveUserPermissions(userId: string): Promise<Record<string, AppPermission>> {
    try {
      const userApps = await this.prisma.userApp.findMany({
        where: { userId, isActive: true, app: { status: AppStatus.ACTIVE } },
        include: {
          role: {
            include: {
              features: { include: { feature: { select: { key: true } } } },
            },
          },
          directFeatures: {
            include: { feature: { select: { key: true } } },
          },
        },
      });

      const result: Record<string, AppPermission> = {};
      for (const ua of userApps) {
        const baseFeatures = ua.role?.features.map((rf) => rf.feature.key) ?? [];
        const grants = new Set(baseFeatures);
        for (const df of ua.directFeatures) {
          if (df.granted) grants.add(df.feature.key);
          else grants.delete(df.feature.key);
        }
        result[ua.appId] = {
          role: ua.role?.name ?? "none",
          roleVersion: ua.role?.version ?? 0,
          features: Array.from(grants),
        };
      }
      return result;
    } catch {
      throw new DatabaseError("Failed to resolve user permissions");
    }
  }

  async resolveUserPermissionsForApp(
    userId: string,
    appId: string
  ): Promise<AppPermission | null> {
    try {
      const ua = await this.prisma.userApp.findUnique({
        where: { userId_appId: { userId, appId } },
        include: {
          role: {
            include: {
              features: { include: { feature: { select: { key: true } } } },
            },
          },
          directFeatures: {
            include: { feature: { select: { key: true } } },
          },
        },
      });

      if (!ua || !ua.isActive) return null;

      const baseFeatures = ua.role?.features.map((rf) => rf.feature.key) ?? [];
      const grants = new Set(baseFeatures);
      for (const df of ua.directFeatures) {
        if (df.granted) grants.add(df.feature.key);
        else grants.delete(df.feature.key);
      }

      return {
        role: ua.role?.name ?? "none",
        roleVersion: ua.role?.version ?? 0,
        features: Array.from(grants),
      };
    } catch {
      throw new DatabaseError("Failed to resolve user permissions for app");
    }
  }
}

export const appRepository = new AppRepository();
