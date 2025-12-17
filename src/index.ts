import { env } from "@/config/env";
import { UserRole, PASSWORD_REQUIREMENTS } from "@/constants";
import logger, { maskEmail } from "@/utils";

logger.info("🚀 Auth Service Starting...");

logger.info("Configuration loaded", {
  environment: env.NODE_ENV,
  port: env.PORT,
  databaseConfigured: !!env.DATABASE_URL,
});

logger.debug("Security settings", {
  maxLoginAttempts: env.MAX_LOGIN_ATTEMPTS,
  lockoutDuration: env.LOCKOUT_DURATION_MINUTES,
  bcryptRounds: env.BCRYPT_ROUNDS,
});

// Test sensitive data sanitization
logger.info("User logged in", {
  email: maskEmail("user@example.com"),
  password: "this-should-be-redacted", // Will be sanitized
  token: "secret-token", // Will be sanitized
});

logger.info("Constants loaded", {
  roles: Object.values(UserRole),
  passwordMinLength: PASSWORD_REQUIREMENTS.minLength,
});

logger.info("✅ Configuration loaded successfully!");
