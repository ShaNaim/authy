import { PrismaClient, OrgApiKey, Prisma } from "@prisma/client";
import { getPrismaClient } from "@/config/database";
import { DatabaseError } from "@/utils/errors";

export class OrgApiKeyRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  async create(data: {
    organizationId: string;
    name: string;
    keyHash: string;
    prefix: string;
    scopes: string[];
    testMode: boolean;
    expiresAt?: Date;
    createdBy: string;
  }): Promise<OrgApiKey> {
    try {
      return await this.prisma.orgApiKey.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DatabaseError("API key collision — please try again");
      }
      throw new DatabaseError("Failed to create API key");
    }
  }

  async findById(id: string): Promise<OrgApiKey | null> {
    try {
      return await this.prisma.orgApiKey.findUnique({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to find API key");
    }
  }

  async findByHash(keyHash: string): Promise<OrgApiKey | null> {
    try {
      return await this.prisma.orgApiKey.findUnique({ where: { keyHash } });
    } catch {
      throw new DatabaseError("Failed to find API key by hash");
    }
  }

  async listByOrg(organizationId: string): Promise<OrgApiKey[]> {
    try {
      return await this.prisma.orgApiKey.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      });
    } catch {
      throw new DatabaseError("Failed to list API keys");
    }
  }

  async update(
    id: string,
    data: { name?: string; scopes?: string[]; expiresAt?: Date | null }
  ): Promise<OrgApiKey> {
    try {
      return await this.prisma.orgApiKey.update({ where: { id }, data });
    } catch {
      throw new DatabaseError("Failed to update API key");
    }
  }

  async touchLastUsed(id: string): Promise<void> {
    try {
      await this.prisma.orgApiKey.update({
        where: { id },
        data: { lastUsedAt: new Date() },
      });
    } catch {
      // Non-critical — don't throw
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.orgApiKey.delete({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to delete API key");
    }
  }

  async countByOrg(organizationId: string): Promise<number> {
    try {
      return await this.prisma.orgApiKey.count({ where: { organizationId } });
    } catch {
      throw new DatabaseError("Failed to count API keys");
    }
  }
}

export const orgApiKeyRepository = new OrgApiKeyRepository();
