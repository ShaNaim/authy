import { PrismaClient, OAuthApp, OAuthAuthCode, OAuthGrantType, Prisma } from "@prisma/client";
import { getPrismaClient } from "@/config/database";
import { DatabaseError } from "@/utils/errors";

export class OAuthRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  // ── OAuth Apps ─────────────────────────────────────────────────────────────

  async createApp(data: {
    organizationId: string;
    name: string;
    clientId: string;
    clientSecretHash: string;
    redirectUris: string[];
    grantTypes: OAuthGrantType[];
    scopes: string[];
  }): Promise<OAuthApp> {
    try {
      return await this.prisma.oAuthApp.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DatabaseError("Client ID collision — please try again");
      }
      throw new DatabaseError("Failed to create OAuth app");
    }
  }

  async findAppById(id: string): Promise<OAuthApp | null> {
    try {
      return await this.prisma.oAuthApp.findUnique({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to find OAuth app");
    }
  }

  async findAppByClientId(clientId: string): Promise<OAuthApp | null> {
    try {
      return await this.prisma.oAuthApp.findUnique({ where: { clientId } });
    } catch {
      throw new DatabaseError("Failed to find OAuth app by client ID");
    }
  }

  async listApps(organizationId: string): Promise<OAuthApp[]> {
    try {
      return await this.prisma.oAuthApp.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      });
    } catch {
      throw new DatabaseError("Failed to list OAuth apps");
    }
  }

  async updateApp(
    id: string,
    data: { name?: string; redirectUris?: string[]; scopes?: string[]; clientSecretHash?: string }
  ): Promise<OAuthApp> {
    try {
      return await this.prisma.oAuthApp.update({ where: { id }, data });
    } catch {
      throw new DatabaseError("Failed to update OAuth app");
    }
  }

  async deleteApp(id: string): Promise<void> {
    try {
      await this.prisma.oAuthApp.delete({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to delete OAuth app");
    }
  }

  async countByOrg(organizationId: string): Promise<number> {
    try {
      return await this.prisma.oAuthApp.count({ where: { organizationId } });
    } catch {
      throw new DatabaseError("Failed to count OAuth apps");
    }
  }

  // ── Auth Codes ─────────────────────────────────────────────────────────────

  async createAuthCode(data: {
    oauthAppId: string;
    userId: string;
    code: string;
    codeChallenge: string;
    redirectUri: string;
    scopes: string[];
    expiresAt: Date;
  }): Promise<OAuthAuthCode> {
    try {
      return await this.prisma.oAuthAuthCode.create({ data });
    } catch {
      throw new DatabaseError("Failed to create auth code");
    }
  }

  async findAuthCode(code: string): Promise<OAuthAuthCode | null> {
    try {
      return await this.prisma.oAuthAuthCode.findUnique({ where: { code } });
    } catch {
      throw new DatabaseError("Failed to find auth code");
    }
  }

  async markAuthCodeUsed(id: string): Promise<void> {
    try {
      await this.prisma.oAuthAuthCode.update({ where: { id }, data: { isUsed: true } });
    } catch {
      throw new DatabaseError("Failed to mark auth code as used");
    }
  }
}

export const oauthRepository = new OAuthRepository();
