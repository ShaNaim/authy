import { PrismaClient, Organization, OrganizationMember, User, OrgStatus, AuthMode, OrgMemberRole, Prisma } from "@prisma/client";
import { getPrismaClient } from "@/config/database";
import { DatabaseError } from "@/utils/errors";

export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export class OrgRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  // ── Organizations ──────────────────────────────────────────────────────────

  async create(data: {
    name: string;
    displayName: string;
    description?: string;
    secretHash: string;
    authMode?: AuthMode;
  }): Promise<Organization> {
    try {
      return await this.prisma.organization.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DatabaseError("Organization name already in use");
      }
      throw new DatabaseError("Failed to create organization");
    }
  }

  async findById(id: string): Promise<Organization | null> {
    try {
      return await this.prisma.organization.findUnique({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to find organization");
    }
  }

  async findByName(name: string): Promise<Organization | null> {
    try {
      return await this.prisma.organization.findUnique({ where: { name } });
    } catch {
      throw new DatabaseError("Failed to find organization by name");
    }
  }

  async findDefault(): Promise<Organization | null> {
    try {
      return await this.prisma.organization.findFirst({ where: { isDefault: true } });
    } catch {
      throw new DatabaseError("Failed to find default organization");
    }
  }

  async list(params: { page: number; limit: number; status?: OrgStatus }): Promise<{ orgs: Organization[]; total: number }> {
    try {
      const where: Prisma.OrganizationWhereInput = params.status ? { status: params.status } : {};
      const [orgs, total] = await Promise.all([
        this.prisma.organization.findMany({
          where,
          skip: (params.page - 1) * params.limit,
          take: params.limit,
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.organization.count({ where }),
      ]);
      return { orgs, total };
    } catch {
      throw new DatabaseError("Failed to list organizations");
    }
  }

  async update(id: string, data: { displayName?: string; description?: string; authMode?: AuthMode }): Promise<Organization> {
    try {
      return await this.prisma.organization.update({ where: { id }, data });
    } catch {
      throw new DatabaseError("Failed to update organization");
    }
  }

  async updateSecret(id: string, secretHash: string): Promise<Organization> {
    try {
      return await this.prisma.organization.update({ where: { id }, data: { secretHash } });
    } catch {
      throw new DatabaseError("Failed to update organization secret");
    }
  }

  async setStatus(id: string, status: OrgStatus): Promise<Organization> {
    try {
      return await this.prisma.organization.update({ where: { id }, data: { status } });
    } catch {
      throw new DatabaseError("Failed to update organization status");
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  async getStats(orgId: string): Promise<{ userCount: number; appCount: number; memberCount: number }> {
    try {
      const [userCount, appCount, memberCount] = await Promise.all([
        this.prisma.user.count({ where: { organizationId: orgId } }),
        this.prisma.app.count({ where: { organizationId: orgId } }),
        this.prisma.organizationMember.count({ where: { organizationId: orgId } }),
      ]);
      return { userCount, appCount, memberCount };
    } catch {
      throw new DatabaseError("Failed to get org stats");
    }
  }

  // ── Members ────────────────────────────────────────────────────────────────

  async addMember(orgId: string, userId: string, role: OrgMemberRole): Promise<OrganizationMember> {
    try {
      return await this.prisma.organizationMember.create({
        data: { organizationId: orgId, userId, role },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DatabaseError("User is already a member of this organization");
      }
      throw new DatabaseError("Failed to add org member");
    }
  }

  async findMember(orgId: string, userId: string): Promise<OrganizationMember | null> {
    try {
      return await this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
      });
    } catch {
      throw new DatabaseError("Failed to find org member");
    }
  }

  async findMemberByUserId(userId: string): Promise<(OrganizationMember & { organization: Organization }) | null> {
    try {
      return await this.prisma.organizationMember.findFirst({
        where: { userId },
        include: { organization: true },
      });
    } catch {
      throw new DatabaseError("Failed to find org membership");
    }
  }

  async listMembers(orgId: string): Promise<(OrganizationMember & { user: Pick<User, "id" | "email" | "firstName" | "lastName"> })[]> {
    try {
      return await this.prisma.organizationMember.findMany({
        where: { organizationId: orgId },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
      });
    } catch {
      throw new DatabaseError("Failed to list org members");
    }
  }

  async removeMember(orgId: string, userId: string): Promise<void> {
    try {
      await this.prisma.organizationMember.delete({
        where: { organizationId_userId: { organizationId: orgId, userId } },
      });
    } catch {
      throw new DatabaseError("Failed to remove org member");
    }
  }

  async updateMemberRole(orgId: string, userId: string, role: OrgMemberRole): Promise<OrganizationMember> {
    try {
      return await this.prisma.organizationMember.update({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        data: { role },
      });
    } catch {
      throw new DatabaseError("Failed to update member role");
    }
  }

  // ── Org Users (end-users belonging to the org) ─────────────────────────────

  async listUsers(orgId: string, params: { page: number; limit: number; search?: string }): Promise<{ users: User[]; total: number }> {
    try {
      const where: Prisma.UserWhereInput = {
        organizationId: orgId,
        ...(params.search
          ? {
              OR: [
                { email: { contains: params.search, mode: "insensitive" } },
                { firstName: { contains: params.search, mode: "insensitive" } },
                { lastName: { contains: params.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          skip: (params.page - 1) * params.limit,
          take: params.limit,
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.user.count({ where }),
      ]);
      return { users, total };
    } catch {
      throw new DatabaseError("Failed to list org users");
    }
  }

  async findUserInOrg(orgId: string, userId: string): Promise<User | null> {
    try {
      return await this.prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
    } catch {
      throw new DatabaseError("Failed to find user in org");
    }
  }

  async findBySecretHash(secretHash: string): Promise<Organization | null> {
    try {
      return await this.prisma.organization.findFirst({ where: { secretHash } });
    } catch {
      throw new DatabaseError("Failed to find organization by secret");
    }
  }

  async findUserByEmailInOrg(orgId: string, email: string): Promise<User | null> {
    try {
      return await this.prisma.user.findFirst({
        where: { organizationId: orgId, email: email.toLowerCase() },
      });
    } catch {
      throw new DatabaseError("Failed to find user by email in org");
    }
  }
}

export const orgRepository = new OrgRepository();
