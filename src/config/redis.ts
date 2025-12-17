import { createClient, RedisClientType } from "redis";
import { env } from "@/config/env";
import logger from "@/utils";

/**
 * Redis client instance
 */
let redisClient: RedisClientType | null = null;

/**
 * Get or create Redis client instance
 */
export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    redisClient = createClient({
      socket: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
      },
      password: env.REDIS_PASSWORD || undefined,
    });

    // Redis event handlers
    redisClient.on("connect", () => {
      logger.info("Redis connecting...");
    });

    redisClient.on("ready", () => {
      logger.info("✅ Redis connected successfully");
    });

    redisClient.on("error", (error) => {
      logger.error("❌ Redis error", { error: error.message });
    });

    redisClient.on("end", () => {
      logger.info("Redis connection closed");
    });

    redisClient.on("reconnecting", () => {
      logger.warn("Redis reconnecting...");
    });
  }

  return redisClient;
}

/**
 * Connect to Redis
 */
export async function connectRedis(): Promise<void> {
  try {
    const client = getRedisClient();

    if (!client.isOpen) {
      await client.connect();
    }
  } catch (error) {
    logger.error("Failed to connect to Redis", { error });
    throw error;
  }
}

/**
 * Disconnect from Redis
 */
export async function disconnectRedis(): Promise<void> {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
      redisClient = null;
      logger.info("Redis disconnected");
    }
  } catch (error) {
    logger.error("Error disconnecting from Redis", { error });
    throw error;
  }
}

/**
 * Check Redis health
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const client = getRedisClient();

    if (!client.isOpen) {
      return false;
    }

    const result = await client.ping();
    return result === "PONG";
  } catch (error) {
    logger.error("Redis health check failed", { error });
    return false;
  }
}

/**
 * Redis helper functions for common operations
 */

/**
 * Set a key with expiration (in seconds)
 */
export async function setWithExpiry(key: string, value: string, expirySeconds: number): Promise<void> {
  const client = getRedisClient();
  await client.setEx(key, expirySeconds, value);
}

/**
 * Get a value by key
 */
export async function get(key: string): Promise<string | null> {
  const client = getRedisClient();
  return await client.get(key);
}

/**
 * Delete a key
 */
export async function del(key: string): Promise<number> {
  const client = getRedisClient();
  return await client.del(key);
}

/**
 * Check if key exists
 */
export async function exists(key: string): Promise<boolean> {
  const client = getRedisClient();
  const result = await client.exists(key);
  return result === 1;
}

// Export client getter as default
export default getRedisClient;
