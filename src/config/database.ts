import { PrismaClient } from "@prisma/client";
import logger from "@/utils";

/**
 * Prisma Client instance
 * Singleton pattern to avoid multiple connections
 */
let prisma: PrismaClient;

/**
 * Get or create Prisma client instance
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { level: "warn", emit: "event" },
        { level: "error", emit: "event" },
      ],
    });

    // Log database warnings and errors via Prisma event emitter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).$on("warn", (e: { message: string }) => {
      logger.warn("Database warning", { message: e.message });
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).$on("error", (e: { message: string }) => {
      logger.error("Database error", { message: e.message });
    });

    logger.info("Prisma client initialized");
  }

  return prisma;
}

/**
 * Connect to database
 */
export async function connectDatabase(): Promise<void> {
  try {
    const client = getPrismaClient();
    await client.$connect();
    logger.info("✅ Database connected successfully");
  } catch (error) {
    logger.error("❌ Database connection failed", { error });
    throw error;
  }
}

/**
 * Disconnect from database
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    if (prisma) {
      await prisma.$disconnect();
      logger.info("Database disconnected");
    }
  } catch (error) {
    logger.error("Error disconnecting from database", { error });
    throw error;
  }
}

/**
 * Check database health
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error("Database health check failed", { error });
    return false;
  }
}

// Export the client getter as default
export default getPrismaClient;
