import { getRedisClient, setWithExpiry, get, del, exists } from "@/config/redis";
import logger from "@/utils/base.logger";

const CACHE_PREFIX = "authy:";
const USER_TTL_SECONDS = 300; // 5 minutes
const ACCESS_BLACKLIST_PREFIX = `${CACHE_PREFIX}bl:access:`;
const REVOKE_BEFORE_PREFIX = `${CACHE_PREFIX}revoke_before:`;
const USER_PREFIX = `${CACHE_PREFIX}user:`;
const PERM_PREFIX = `${CACHE_PREFIX}perm:`;
const MAU_PREFIX = `${CACHE_PREFIX}mau:`;
const API_CALLS_PREFIX = `${CACHE_PREFIX}apicalls:`;
const PERM_TTL_SECONDS = 60;

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

  // ── Permission Cache (for /check endpoint) ───────────────────────────────

  permKey(userId: string, appId: string, roleVersion: number): string {
    return `${PERM_PREFIX}${userId}:${appId}:${roleVersion}`;
  }

  async setPermissions(userId: string, appId: string, roleVersion: number, features: string[]): Promise<void> {
    try {
      await setWithExpiry(this.permKey(userId, appId, roleVersion), JSON.stringify(features), PERM_TTL_SECONDS);
    } catch (err) {
      logger.warn("Failed to cache permissions", { userId, appId, err });
    }
  }

  async getPermissions(userId: string, appId: string, roleVersion: number): Promise<string[] | null> {
    try {
      const raw = await get(this.permKey(userId, appId, roleVersion));
      return raw ? (JSON.parse(raw) as string[]) : null;
    } catch (err) {
      logger.warn("Failed to get cached permissions", { userId, appId, err });
      return null;
    }
  }

  async invalidatePermissionsForUser(userId: string): Promise<void> {
    try {
      const client = getRedisClient();
      const pattern = `${PERM_PREFIX}${userId}:*`;
      const keys = await client.keys(pattern);
      if (keys.length > 0) await client.del(keys);
    } catch (err) {
      logger.warn("Failed to invalidate permission cache for user", { userId, err });
    }
  }

  // ── MAU tracking (Redis HyperLogLog per org per month) ───────────────────

  mauKey(orgId: string): string {
    const now = new Date();
    return `${MAU_PREFIX}${orgId}:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  async trackMau(orgId: string, userId: string): Promise<void> {
    try {
      const client = getRedisClient();
      const key = this.mauKey(orgId);
      await client.pfAdd(key, userId);
      // Expire at end of next month (max ~62 days)
      await client.expire(key, 62 * 24 * 3600);
    } catch (err) {
      logger.warn("Failed to track MAU", { orgId, userId, err });
    }
  }

  async getMau(orgId: string): Promise<number> {
    try {
      const client = getRedisClient();
      return await client.pfCount(this.mauKey(orgId));
    } catch (err) {
      logger.warn("Failed to get MAU count", { orgId, err });
      return 0;
    }
  }

  // ── API call tracking (Redis incr per org per UTC day) ───────────────────

  apiCallsKey(orgId: string): string {
    const now = new Date();
    return `${API_CALLS_PREFIX}${orgId}:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  }

  async incrementApiCalls(orgId: string): Promise<number> {
    try {
      const client = getRedisClient();
      const key = this.apiCallsKey(orgId);
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, 25 * 3600); // 25h TTL so it outlives the day
      return count;
    } catch (err) {
      logger.warn("Failed to increment API calls", { orgId, err });
      return 0;
    }
  }

  async getApiCallsToday(orgId: string): Promise<number> {
    try {
      const raw = await get(this.apiCallsKey(orgId));
      return raw ? Number(raw) : 0;
    } catch (err) {
      logger.warn("Failed to get API calls today", { orgId, err });
      return 0;
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
