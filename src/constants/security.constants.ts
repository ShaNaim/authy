// Security limits
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// Token & email expiry
export const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

// Rate limiting
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 100;
export const DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS = 5;
