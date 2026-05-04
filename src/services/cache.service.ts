import { getRedisClient, setWithExpiry, get, del, exists } from "@/config/redis";
import logger from "@/utils/base.logger";

const CACHE_PREFIX = "authy:";
const USER_TTL_SECONDS = 300; // 5 minutes
const ACCESS_BLACKLIST_PREFIX = `${CACHE_PREFIX}bl:access:`;
const REVOKE_BEFORE_PREFIX = `${CACHE_PREFIX}revoke_before:`;
const USER_PREFIX = `${CACHE_PREFIX}user:`;

export class CacheService {
  // ── User Cache ────────────────────────────────────────────────────────────

  async setUser(userId: string, data: unknown): Promise<void> {
    try {
      await setWithExpiry(`${USER_PREFIX}${userId}`, JSON.stringify(data), USER_TTL_SECONDS);
    } catch (err) {
      logger.warn("Failed to cache user", { userId, err });
    }
  }

  async getUser<T>(userId: string): Promise<T | null> {
    try {
      const raw = await get(`${USER_PREFIX}${userId}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      logger.warn("Failed to get cached user", { userId, err });
      return null;
    }
  }

  async invalidateUser(userId: string): Promise<void> {
    try {
      await del(`${USER_PREFIX}${userId}`);
    } catch (err) {
      logger.warn("Failed to invalidate user cache", { userId, err });
    }
  }

  // ── Access Token Blacklist ────────────────────────────────────────────────

  async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    try {
      await setWithExpiry(`${ACCESS_BLACKLIST_PREFIX}${jti}`, "1", ttlSeconds);
    } catch (err) {
      logger.warn("Failed to blacklist access token", { jti, err });
    }
  }

  async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    try {
      return await exists(`${ACCESS_BLACKLIST_PREFIX}${jti}`);
    } catch (err) {
      logger.warn("Failed to check token blacklist", { jti, err });
      return false;
    }
  }

  // ── Per-user Revocation Timestamp (for logout-all) ───────────────────────

  async setUserRevocationTime(userId: string, timestamp: number): Promise<void> {
    try {
      // Keep for 30 days (longer than any token TTL)
      await setWithExpiry(`${REVOKE_BEFORE_PREFIX}${userId}`, String(timestamp), 30 * 24 * 3600);
    } catch (err) {
      logger.warn("Failed to set user revocation time", { userId, err });
    }
  }

  async getUserRevocationTime(userId: string): Promise<number | null> {
    try {
      const raw = await get(`${REVOKE_BEFORE_PREFIX}${userId}`);
      return raw ? Number(raw) : null;
    } catch (err) {
      logger.warn("Failed to get user revocation time", { userId, err });
      return null;
    }
  }

  // ── Generic ────────────────────────────────────────────────────────────────

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await setWithExpiry(`${CACHE_PREFIX}${key}`, value, ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    return get(`${CACHE_PREFIX}${key}`);
  }

  async del(key: string): Promise<void> {
    await del(`${CACHE_PREFIX}${key}`);
  }

  async ping(): Promise<boolean> {
    try {
      const client = getRedisClient();
      const result = await client.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }
}

export const cacheService = new CacheService();
