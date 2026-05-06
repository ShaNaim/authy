import { RefreshToken } from "@prisma/client";
import { tokenRepository } from "@/repositories/token.repository";
import { cacheService } from "@/services/cache.service";
import { hashToken, generateSecureToken, generateExpiryDate, isExpired } from "@/utils/token.utils";
import { verifyRefreshToken, getTokenRemainingTtl } from "@/utils/jwt.utils";
import { AuthenticationError } from "@/utils/errors";
import { EMAIL_VERIFICATION_EXPIRY_MS, PASSWORD_RESET_EXPIRY_MS } from "@/constants";
import { RefreshTokenPayload } from "@/types";

const REFRESH_TTL_SECONDS = 7 * 24 * 3600;

export class TokenService {
  // ── Refresh Token Management ─────────────────────────────────────────────

  async createRefreshToken(
    userId: string,
    rawToken: string,
    meta?: { userAgent?: string; ipAddress?: string }
  ): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const expiresAt = generateExpiryDate(REFRESH_TTL_SECONDS * 1000);
    await tokenRepository.createRefreshToken({
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
    });
  }

  async verifyAndConsumeRefreshToken(
    rawToken: string
  ): Promise<{ payload: RefreshTokenPayload; storedToken: RefreshToken }> {
    const payload = verifyRefreshToken(rawToken);
    const tokenHash = hashToken(rawToken);
    const storedToken = await tokenRepository.findRefreshToken(tokenHash);

    if (!storedToken || storedToken.isRevoked) {
      throw new AuthenticationError("Refresh token is invalid or has been revoked");
    }
    if (isExpired(storedToken.expiresAt)) {
      throw new AuthenticationError("Refresh token has expired");
    }

    // Revoke old token (token rotation — caller will issue a new one)
    await tokenRepository.revokeRefreshToken(storedToken.id);

    return { payload, storedToken };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const stored = await tokenRepository.findRefreshToken(tokenHash);
    if (stored && !stored.isRevoked) {
      await tokenRepository.revokeRefreshToken(stored.id);
    }
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<number> {
    return tokenRepository.revokeAllUserRefreshTokens(userId);
  }

  // ── Access Token Blacklist ───────────────────────────────────────────────

  async blacklistAccessToken(jti: string, exp: number): Promise<void> {
    const ttl = getTokenRemainingTtl(exp);
    if (ttl > 0) {
      await cacheService.blacklistAccessToken(jti, ttl);
    }
  }

  async isAccessTokenRevoked(jti: string, userId: string, iat: number): Promise<boolean> {
    const blacklisted = await cacheService.isAccessTokenBlacklisted(jti);
    if (blacklisted) return true;

    const revokeBefore = await cacheService.getUserRevocationTime(userId);
    if (revokeBefore !== null && iat < revokeBefore) return true;

    return false;
  }

  // ── Email Verification Tokens ────────────────────────────────────────────

  async createEmailVerificationToken(userId: string): Promise<string> {
    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = generateExpiryDate(EMAIL_VERIFICATION_EXPIRY_MS);
    await tokenRepository.createEmailVerificationToken({ userId, tokenHash, expiresAt });
    return rawToken;
  }

  async invalidateAllEmailVerificationTokens(userId: string): Promise<void> {
    return tokenRepository.invalidateAllEmailVerificationTokens(userId);
  }

  async consumeEmailVerificationToken(rawToken: string): Promise<string> {
    const tokenHash = hashToken(rawToken);
    const stored = await tokenRepository.findEmailVerificationToken(tokenHash);

    if (!stored || stored.isUsed) {
      throw new AuthenticationError("Invalid or already-used verification token");
    }
    if (isExpired(stored.expiresAt)) {
      throw new AuthenticationError("Verification token has expired. Please request a new one.");
    }

    await tokenRepository.markEmailVerificationTokenUsed(stored.id);
    return stored.userId;
  }

  // ── Password Reset Tokens ────────────────────────────────────────────────

  async createPasswordResetToken(userId: string): Promise<string> {
    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = generateExpiryDate(PASSWORD_RESET_EXPIRY_MS);
    await tokenRepository.createPasswordResetToken({ userId, tokenHash, expiresAt });
    return rawToken;
  }

  async consumePasswordResetToken(rawToken: string): Promise<string> {
    const tokenHash = hashToken(rawToken);
    const stored = await tokenRepository.findPasswordResetToken(tokenHash);

    if (!stored || stored.isUsed) {
      throw new AuthenticationError("Invalid or already-used reset token");
    }
    if (isExpired(stored.expiresAt)) {
      throw new AuthenticationError("Reset token has expired. Please request a new one.");
    }

    await tokenRepository.markPasswordResetTokenUsed(stored.id);
    return stored.userId;
  }
}

export const tokenService = new TokenService();
