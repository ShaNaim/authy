/**
 * Unit tests for Zod validation schemas
 */

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.JWT_ACCESS_SECRET = "test-access-secret-minimum-32-characters-long";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-minimum-32-characters-long";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.INTERNAL_API_KEY = "test-internal-api-key-minimum-32-characters";
process.env.BCRYPT_ROUNDS = "4";

import {
  registerSchema,
  loginSchema,
  resetPasswordSchema,
  changePasswordSchema,
  paginationSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  refreshTokenSchema,
} from "@/utils/validation.schemas";

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_EMAIL = "user@example.com";
const VALID_PASSWORD = "ValidPass1@";

function parseOk<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const result = schema.safeParse(value);
  expect(result.success).toBe(true);
  return (result as any).data as T;
}

function parseFail(schema: { safeParse: (v: unknown) => { success: boolean; error?: any } }, value: unknown): string[] {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  return (result as any).error.issues.map((i: any) => i.message) as string[];
}

// ── registerSchema ────────────────────────────────────────────────────────────

describe("registerSchema", () => {
  it("passes with a valid email and strong password", () => {
    const data = parseOk(registerSchema, { email: VALID_EMAIL, password: VALID_PASSWORD });
    expect(data.email).toBe(VALID_EMAIL);
  });

  it("normalises email to lowercase", () => {
    const data = parseOk(registerSchema, { email: "USER@EXAMPLE.COM", password: VALID_PASSWORD });
    expect(data.email).toBe("user@example.com");
  });

  it("fails when email has leading/trailing whitespace (Zod v4 validates before transforming)", () => {
    // In Zod v4, .email() validation runs before .trim(), so surrounding spaces cause failure
    const result = registerSchema.safeParse({ email: "  user@example.com  ", password: VALID_PASSWORD });
    expect(result.success).toBe(false);
  });

  it("fails with an invalid email address", () => {
    const errors = parseFail(registerSchema, { email: "not-an-email", password: VALID_PASSWORD });
    expect(errors.some((e) => e.toLowerCase().includes("email"))).toBe(true);
  });

  it("fails when email is missing", () => {
    const result = registerSchema.safeParse({ password: VALID_PASSWORD });
    expect(result.success).toBe(false);
  });

  it("fails when password is missing", () => {
    const result = registerSchema.safeParse({ email: VALID_EMAIL });
    expect(result.success).toBe(false);
  });

  it("fails with a password missing an uppercase letter", () => {
    const errors = parseFail(registerSchema, { email: VALID_EMAIL, password: "nouppercase1@" });
    expect(errors.some((e) => e.includes("uppercase"))).toBe(true);
  });

  it("fails with a password missing a lowercase letter", () => {
    const errors = parseFail(registerSchema, { email: VALID_EMAIL, password: "NOLOWER1@" });
    expect(errors.some((e) => e.includes("lowercase"))).toBe(true);
  });

  it("fails with a password missing a number", () => {
    const errors = parseFail(registerSchema, { email: VALID_EMAIL, password: "NoNumbers@Abc" });
    expect(errors.some((e) => e.includes("number"))).toBe(true);
  });

  it("fails with a password missing a special character", () => {
    const errors = parseFail(registerSchema, { email: VALID_EMAIL, password: "NoSpecial123Abc" });
    expect(errors.some((e) => e.includes("special character"))).toBe(true);
  });

  it("fails with a password shorter than the minimum length", () => {
    const errors = parseFail(registerSchema, { email: VALID_EMAIL, password: "Sh1@" });
    expect(errors.some((e) => e.includes("at least"))).toBe(true);
  });

  it("fails with a password longer than 128 characters", () => {
    const tooLong = "A1@" + "a".repeat(127);
    const errors = parseFail(registerSchema, { email: VALID_EMAIL, password: tooLong });
    expect(errors.some((e) => e.includes("at most"))).toBe(true);
  });
});

// ── loginSchema ───────────────────────────────────────────────────────────────

describe("loginSchema", () => {
  it("passes with valid email and any non-empty password", () => {
    const data = parseOk(loginSchema, { email: VALID_EMAIL, password: "anything" });
    expect(data.email).toBe(VALID_EMAIL);
    expect(data.password).toBe("anything");
  });

  it("normalises email to lowercase", () => {
    const data = parseOk(loginSchema, { email: "UPPER@EXAMPLE.COM", password: "pass" });
    expect(data.email).toBe("upper@example.com");
  });

  it("fails with an invalid email", () => {
    const errors = parseFail(loginSchema, { email: "bad", password: "pass" });
    expect(errors.some((e) => e.toLowerCase().includes("email"))).toBe(true);
  });

  it("fails when password is empty", () => {
    const errors = parseFail(loginSchema, { email: VALID_EMAIL, password: "" });
    expect(errors.some((e) => e.toLowerCase().includes("required") || e.toLowerCase().includes("least"))).toBe(true);
  });

  it("fails when email is missing", () => {
    const result = loginSchema.safeParse({ password: "ValidPass1@" });
    expect(result.success).toBe(false);
  });

  it("fails when password is missing", () => {
    const result = loginSchema.safeParse({ email: VALID_EMAIL });
    expect(result.success).toBe(false);
  });

  it("accepts a weak password (login only checks non-empty)", () => {
    // Login intentionally accepts any non-empty password
    const result = loginSchema.safeParse({ email: VALID_EMAIL, password: "weak" });
    expect(result.success).toBe(true);
  });
});

// ── resetPasswordSchema ───────────────────────────────────────────────────────

describe("resetPasswordSchema", () => {
  it("passes with a valid reset token and strong new password", () => {
    const data = parseOk(resetPasswordSchema, { token: "some-reset-token", newPassword: VALID_PASSWORD });
    expect(data.token).toBe("some-reset-token");
    expect(data.newPassword).toBe(VALID_PASSWORD);
  });

  it("fails when token is missing", () => {
    const result = resetPasswordSchema.safeParse({ newPassword: VALID_PASSWORD });
    expect(result.success).toBe(false);
  });

  it("fails when token is empty", () => {
    const errors = parseFail(resetPasswordSchema, { token: "", newPassword: VALID_PASSWORD });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("fails when newPassword is missing", () => {
    const result = resetPasswordSchema.safeParse({ token: "valid-token" });
    expect(result.success).toBe(false);
  });

  it("fails when newPassword is weak (no uppercase)", () => {
    const errors = parseFail(resetPasswordSchema, { token: "tok", newPassword: "weakpassword1@" });
    expect(errors.some((e) => e.includes("uppercase"))).toBe(true);
  });

  it("fails when newPassword has no special character", () => {
    const errors = parseFail(resetPasswordSchema, { token: "tok", newPassword: "NoSpecial123" });
    expect(errors.some((e) => e.includes("special character"))).toBe(true);
  });
});

// ── changePasswordSchema ──────────────────────────────────────────────────────

describe("changePasswordSchema", () => {
  it("passes with currentPassword and a strong newPassword", () => {
    const data = parseOk(changePasswordSchema, {
      currentPassword: "OldPass1@",
      newPassword: VALID_PASSWORD,
    });
    expect(data.currentPassword).toBe("OldPass1@");
  });

  it("fails when currentPassword is missing", () => {
    const result = changePasswordSchema.safeParse({ newPassword: VALID_PASSWORD });
    expect(result.success).toBe(false);
  });

  it("fails when currentPassword is empty", () => {
    const errors = parseFail(changePasswordSchema, { currentPassword: "", newPassword: VALID_PASSWORD });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("fails when newPassword is missing", () => {
    const result = changePasswordSchema.safeParse({ currentPassword: "OldPass1@" });
    expect(result.success).toBe(false);
  });

  it("fails when newPassword is weak", () => {
    const errors = parseFail(changePasswordSchema, { currentPassword: "OldPass1@", newPassword: "weak" });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ── paginationSchema ──────────────────────────────────────────────────────────

describe("paginationSchema", () => {
  it("defaults to page=1 and limit=20 when no values provided", () => {
    const data = parseOk(paginationSchema, {});
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
  });

  it("coerces string '2' to number 2 for page", () => {
    const data = parseOk(paginationSchema, { page: "2" });
    expect(data.page).toBe(2);
  });

  it("coerces string '50' to number 50 for limit", () => {
    const data = parseOk(paginationSchema, { limit: "50" });
    expect(data.limit).toBe(50);
  });

  it("accepts explicit numeric values", () => {
    const data = parseOk(paginationSchema, { page: 3, limit: 10 });
    expect(data.page).toBe(3);
    expect(data.limit).toBe(10);
  });

  it("rejects page=0 (minimum is 1)", () => {
    const result = paginationSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative page numbers", () => {
    const result = paginationSchema.safeParse({ page: -5 });
    expect(result.success).toBe(false);
  });

  it("rejects limit > 100", () => {
    const result = paginationSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it("accepts limit=100 (boundary)", () => {
    const data = parseOk(paginationSchema, { limit: 100 });
    expect(data.limit).toBe(100);
  });

  it("accepts limit=1 (boundary)", () => {
    const data = parseOk(paginationSchema, { limit: 1 });
    expect(data.limit).toBe(1);
  });
});

// ── verifyEmailSchema ─────────────────────────────────────────────────────────

describe("verifyEmailSchema", () => {
  it("passes with a non-empty token", () => {
    const data = parseOk(verifyEmailSchema, { token: "valid-token-123" });
    expect(data.token).toBe("valid-token-123");
  });

  it("fails when token is missing", () => {
    const result = verifyEmailSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("fails when token is empty string", () => {
    const result = verifyEmailSchema.safeParse({ token: "" });
    expect(result.success).toBe(false);
  });
});

// ── forgotPasswordSchema ──────────────────────────────────────────────────────

describe("forgotPasswordSchema", () => {
  it("passes with a valid email", () => {
    const data = parseOk(forgotPasswordSchema, { email: VALID_EMAIL });
    expect(data.email).toBe(VALID_EMAIL);
  });

  it("normalises email to lowercase", () => {
    const data = parseOk(forgotPasswordSchema, { email: "UPPER@EXAMPLE.COM" });
    expect(data.email).toBe("upper@example.com");
  });

  it("fails with an invalid email", () => {
    const result = forgotPasswordSchema.safeParse({ email: "bad-email" });
    expect(result.success).toBe(false);
  });
});

// ── refreshTokenSchema ────────────────────────────────────────────────────────

describe("refreshTokenSchema", () => {
  it("passes with a non-empty refreshToken", () => {
    const data = parseOk(refreshTokenSchema, { refreshToken: "some.jwt.token" });
    expect(data.refreshToken).toBe("some.jwt.token");
  });

  it("fails when refreshToken is missing", () => {
    const result = refreshTokenSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("fails when refreshToken is empty string", () => {
    const result = refreshTokenSchema.safeParse({ refreshToken: "" });
    expect(result.success).toBe(false);
  });
});
