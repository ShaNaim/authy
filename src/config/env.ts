import { z } from "zod";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Environment variable schema with validation
 * Uses Zod for runtime type checking and validation
 */
const envSchema = z.object({
  // Server configuration
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(3031),
  API_VERSION: z.string().default("v1"),

  // Database
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection string"),

  // Redis
  REDIS_HOST: z.string().min(1, "REDIS_HOST is required"),
  REDIS_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),

  // JWT Secrets
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  // JWT Expiration
  ACCESS_TOKEN_EXPIRY: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRY: z.string().default("7d"),

  // Email (optional for now)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).pipe(z.number()).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // Frontend URL
  FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL").default("http://localhost:3000"),

  // Security
  MAX_LOGIN_ATTEMPTS: z.string().transform(Number).pipe(z.number().min(1)).default(5),
  LOCKOUT_DURATION_MINUTES: z.string().transform(Number).pipe(z.number().min(1)).default(15),
  BCRYPT_ROUNDS: z.string().transform(Number).pipe(z.number().min(4).max(15)).default(12),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().min(1000)).default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().min(1)).default(100),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().min(1)).default(5),

  // Internal / S2S API key
  INTERNAL_API_KEY: z.string().min(32, "INTERNAL_API_KEY must be at least 32 characters").optional(),

  // Password history
  PASSWORD_HISTORY_LIMIT: z.string().transform(Number).pipe(z.number().min(1).max(24)).default(5),

  // OAuth 2.0 RSA keypair (PEM, optional — ephemeral keypair used if not set)
  OAUTH_PRIVATE_KEY: z.string().optional(),
  OAUTH_PUBLIC_KEY: z.string().optional(),
  OAUTH_KEY_ID: z.string().optional(),
});

/**
 * Validate and parse environment variables
 * Throws error if validation fails
 */
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Environment validation failed:");
      error.issues.forEach((err: z.ZodIssue) => {
        console.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

// Export validated environment variables
export const env = parseEnv();

// Export types for TypeScript
export type Env = z.infer<typeof envSchema>;
