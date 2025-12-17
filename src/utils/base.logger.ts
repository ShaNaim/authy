import winston from "winston";
import { env } from "@/config/env";

/**
 * Custom log format for structured logging
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const sanitizedMeta = sanitizeLogData(meta);

    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    if (Object.keys(sanitizedMeta).length > 0) {
      log += ` ${JSON.stringify(sanitizedMeta)}`;
    }

    return log;
  })
);

/**
 * JSON format for production (easier to parse)
 */
const jsonFormat = winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json());

/**
 * Sanitize sensitive data before logging
 * Removes passwords, tokens, and other sensitive fields
 */
function sanitizeLogData(data: any): any {
  const sensitiveFields = ["password", "passwordHash", "token", "accessToken", "refreshToken", "authorization", "cookie", "passwordResetToken", "emailVerificationToken"];

  if (typeof data !== "object" || data === null) {
    return data;
  }

  const sanitized = { ...data };

  for (const key in sanitized) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveFields.some((field) => lowerKey.includes(field));

    if (isSensitive) {
      sanitized[key] = "***REDACTED***";
    } else if (typeof sanitized[key] === "object") {
      sanitized[key] = sanitizeLogData(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Winston logger instance
 */
const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: env.NODE_ENV === "production" ? jsonFormat : logFormat,
  defaultMeta: { service: "auth-service" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), logFormat, winston.format.colorize({ all: true })),
    }),
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 14, // Keep 14 days
    }),

    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 14, // Keep 14 days
    }),
  ],

  exitOnError: false,
});

/**
 * Helper function to mask sensitive data in strings (like emails)
 * Example: user@example.com -> u***@example.com
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return email;

  const [localPart, domain] = email.split("@");
  const maskedLocal = localPart.charAt(0) + "***";
  return `${maskedLocal}@${domain}`;
}

/**
 * Helper function to mask IP addresses partially
 * Example: 192.168.1.100 -> 192.168.***.***
 */
export function maskIP(ip: string): string {
  if (!ip) return ip;

  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  return ip;
}

export default logger;
