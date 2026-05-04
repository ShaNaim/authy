import { PrismaClient, RefreshToken, EmailVerification, PasswordReset } from "@prisma/client";
import { getPrismaClient } from "@/config/database";
import { DatabaseError } from "@/utils/errors";

export class TokenRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  // ── Refresh Tokens ──────────────────────────────────────────────────────────

  async createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<RefreshToken> {
    try {
      return await this.prisma.refreshToken.create({ data });
    } catch {
      throw new DatabaseError("Failed to create refresh token");
    }
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    try {
      return await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    } catch {
      throw new DatabaseError("Failed to find refresh token");
    }
  }

  async revokeRefreshToken(id: string): Promise<void> {
    try {
      await this.prisma.refreshToken.update({ where: { id }, data: { isRevoked: true } });
    } catch {
      throw new DatabaseError("Failed to revoke refresh token");
    }
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<number> {
    try {
      const result = await this.prisma.refreshToken.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      });
      return result.count;
    } catch {
      throw new DatabaseError("Failed to revoke all refresh tokens");
    }
  }

  async deleteExpiredRefreshTokens(): Promise<number> {
    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      return result.count;
    } catch {
      throw new DatabaseError("Failed to delete expired refresh tokens");
    }
  }

  // ── Email Verification Tokens ────────────────────────────────────────────────

  async createEmailVerificationToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<EmailVerification> {
    try {
      // Invalidate any previous tokens for this user
      await this.prisma.emailVerification.updateMany({
        where: { userId: data.userId, isUsed: false },
        data: { isUsed: true },
      });
      return await this.prisma.emailVerification.create({ data });
    } catch {
      throw new DatabaseError("Failed to create email verification token");
    }
  }

  async findEmailVerificationToken(tokenHash: string): Promise<EmailVerification | null> {
    try {
      return await this.prisma.emailVerification.findUnique({ where: { tokenHash } });
    } catch {
      throw new DatabaseError("Failed to find email verification token");
    }
  }

  async markEmailVerificationTokenUsed(id: string): Promise<void> {
    try {
      await this.prisma.emailVerification.update({ where: { id }, data: { isUsed: true } });
    } catch {
      throw new DatabaseError("Failed to mark email verification token as used");
    }
  }

  // ── Password Reset Tokens ────────────────────────────────────────────────────

  async createPasswordResetToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordReset> {
    try {
      // Invalidate any previous reset tokens for this user
      await this.prisma.passwordReset.updateMany({
        where: { userId: data.userId, isUsed: false },
        data: { isUsed: true },
      });
      return await this.prisma.passwordReset.create({ data });
    } catch {
      throw new DatabaseError("Failed to create password reset token");
    }
  }

  async findPasswordResetToken(tokenHash: string): Promise<PasswordReset | null> {
    try {
      return await this.prisma.passwordReset.findUnique({ where: { tokenHash } });
    } catch {
      throw new DatabaseError("Failed to find password reset token");
    }
  }

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    try {
      await this.prisma.passwordReset.update({ where: { id }, data: { isUsed: true } });
    } catch {
      throw new DatabaseError("Failed to mark password reset token as used");
    }
  }
}

export const tokenRepository = new TokenRepository();
