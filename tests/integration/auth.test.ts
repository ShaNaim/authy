/**
 * Integration tests for the Authy auth service HTTP API.
 *
 * All infrastructure (DB, Redis, queues, repositories) is mocked so that
 * these tests exercise routing, middleware, controllers and services without
 * any real network connections.
 *
 * IMPORTANT: jest.mock() calls are hoisted to the top of the compiled
 * module by Jest, so they execute before any imports.
 */

// ── Infrastructure mocks ──────────────────────────────────────────────────────

jest.mock("@/config/database", () => ({
  getPrismaClient: jest.fn(),
  connectDatabase: jest.fn().mockResolvedValue(undefined),
  disconnectDatabase: jest.fn().mockResolvedValue(undefined),
  checkDatabaseHealth: jest.fn().mockResolvedValue(true),
}));

jest.mock("@/config/redis", () => ({
  getRedisClient: jest.fn(),
  connectRedis: jest.fn().mockResolvedValue(undefined),
  disconnectRedis: jest.fn().mockResolvedValue(undefined),
  checkRedisHealth: jest.fn().mockResolvedValue(true),
  setWithExpiry: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(false),
}));

jest.mock("@/services/queue.service", () => ({
  enqueueEmail: jest.fn().mockResolvedValue(undefined),
  getEmailQueue: jest.fn(),
  closeQueues: jest.fn().mockResolvedValue(undefined),
  EMAIL_JOB_TYPES: {
    SEND_VERIFICATION: "send-verification-email",
    SEND_PASSWORD_RESET: "send-password-reset-email",
    SEND_WELCOME: "send-welcome-email",
    SEND_PASSWORD_CHANGED: "send-password-changed-email",
  },
  QUEUE_NAMES: { EMAIL: "authy:email" },
}));

// Mock the repository modules — we override the singleton instances below.
jest.mock("@/repositories/user.repository", () => {
  const mockUserRepo = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    resetLoginAttempts: jest.fn(),
    incrementFailedLoginAttempts: jest.fn(),
    lockAccount: jest.fn(),
    markEmailVerified: jest.fn(),
    addPasswordHistory: jest.fn(),
    getPasswordHistory: jest.fn(),
    deactivate: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    updatePassword: jest.fn(),
  };
  return {
    UserRepository: jest.fn().mockImplementation(() => mockUserRepo),
    userRepository: mockUserRepo,
  };
});

jest.mock("@/repositories/token.repository", () => {
  const mockTokenRepo = {
    createRefreshToken: jest.fn(),
    findRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    revokeAllUserRefreshTokens: jest.fn(),
    createEmailVerificationToken: jest.fn(),
    findEmailVerificationToken: jest.fn(),
    markEmailVerificationTokenUsed: jest.fn(),
    createPasswordResetToken: jest.fn(),
    findPasswordResetToken: jest.fn(),
    markPasswordResetTokenUsed: jest.fn(),
    deleteExpiredRefreshTokens: jest.fn(),
  };
  return {
    TokenRepository: jest.fn().mockImplementation(() => mockTokenRepo),
    tokenRepository: mockTokenRepo,
  };
});

jest.mock("@/repositories/audit-log.repository", () => {
  const mockAuditRepo = {
    create: jest.fn(),
    findByUserId: jest.fn(),
    findAll: jest.fn(),
    deleteOlderThan: jest.fn(),
  };
  return {
    AuditLogRepository: jest.fn().mockImplementation(() => mockAuditRepo),
    auditLogRepository: mockAuditRepo,
  };
});

// ── Env must be set before any src import (env.ts runs at import time) ────────

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.JWT_ACCESS_SECRET = "test-access-secret-minimum-32-characters-long";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-minimum-32-characters-long";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.INTERNAL_API_KEY = "test-internal-api-key-minimum-32-characters";
process.env.BCRYPT_ROUNDS = "4";

// ── Imports ───────────────────────────────────────────────────────────────────

import request from "supertest";
import jwt from "jsonwebtoken";
import app from "@/app";
import { hashPassword } from "@/utils/password.utils";

// Pull the mock repository singletons for test control
import { userRepository } from "@/repositories/user.repository";
import { tokenRepository } from "@/repositories/token.repository";
import { auditLogRepository } from "@/repositories/audit-log.repository";

const mockUserRepo = userRepository as jest.Mocked<typeof userRepository>;
const mockTokenRepo = tokenRepository as jest.Mocked<typeof tokenRepository>;
const mockAuditRepo = auditLogRepository as jest.Mocked<typeof auditLogRepository>;

// ── Fixture factories ─────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "user-uuid-001",
    email: "test@example.com",
    passwordHash: "$2b$04$fixedHashForTestingPurposesOnlyAAAAAAAAAAAAAAAAAAAAAAAAAA",
    role: "USER",
    isVerified: true,
    isActive: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastLoginIp: null,
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    passwordResetToken: null,
    passwordResetExpiry: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeRefreshToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "rt-uuid-001",
    userId: "user-uuid-001",
    tokenHash: "hash",
    isRevoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    createdAt: new Date(),
    userAgent: null,
    ipAddress: null,
    ...overrides,
  };
}

function makeEmailVerificationRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ev-uuid-001",
    userId: "user-uuid-001",
    tokenHash: "ev-hash",
    isUsed: false,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    createdAt: new Date(),
    ...overrides,
  };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

const VALID_PASSWORD = "ValidPass1@";
const VALID_EMAIL = "test@example.com";
const ACCESS_SECRET = "test-access-secret-minimum-32-characters-long";

function makeAccessToken(payload: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      userId: "user-uuid-001",
      email: VALID_EMAIL,
      role: "USER",
      type: "access",
      jti: "jti-test-001",
      ...payload,
    },
    ACCESS_SECRET,
    { expiresIn: "15m" }
  );
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Restore safe defaults for all repository methods after each clearAllMocks
  mockUserRepo.findByEmail.mockResolvedValue(null);
  mockUserRepo.findById.mockResolvedValue(null);
  mockUserRepo.create.mockResolvedValue(makeUser() as any);
  mockUserRepo.update.mockResolvedValue(makeUser() as any);
  mockUserRepo.resetLoginAttempts.mockResolvedValue(makeUser() as any);
  mockUserRepo.incrementFailedLoginAttempts.mockResolvedValue(makeUser({ failedLoginAttempts: 1 }) as any);
  mockUserRepo.lockAccount.mockResolvedValue(makeUser() as any);
  mockUserRepo.markEmailVerified.mockResolvedValue(makeUser({ isVerified: true }) as any);
  mockUserRepo.addPasswordHistory.mockResolvedValue(undefined as any);
  mockUserRepo.getPasswordHistory.mockResolvedValue([]);
  mockUserRepo.updatePassword.mockResolvedValue(makeUser() as any);

  mockTokenRepo.createRefreshToken.mockResolvedValue(makeRefreshToken() as any);
  mockTokenRepo.findRefreshToken.mockResolvedValue(null);
  mockTokenRepo.revokeRefreshToken.mockResolvedValue(undefined as any);
  mockTokenRepo.revokeAllUserRefreshTokens.mockResolvedValue(1 as any);
  mockTokenRepo.createEmailVerificationToken.mockResolvedValue(makeEmailVerificationRecord() as any);
  mockTokenRepo.findEmailVerificationToken.mockResolvedValue(null);
  mockTokenRepo.markEmailVerificationTokenUsed.mockResolvedValue(undefined as any);
  mockTokenRepo.createPasswordResetToken.mockResolvedValue(makeEmailVerificationRecord() as any);
  mockTokenRepo.findPasswordResetToken.mockResolvedValue(null);
  mockTokenRepo.markPasswordResetTokenUsed.mockResolvedValue(undefined as any);

  mockAuditRepo.create.mockResolvedValue({ id: "audit-001" } as any);
});

// ── POST /api/v1/auth/register ────────────────────────────────────────────────

describe("POST /api/v1/auth/register", () => {
  it("returns 201 with success data for valid registration", async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.create.mockResolvedValue(makeUser() as any);

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it("returns 201 and the user object (without sensitive fields) on success", async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.create.mockResolvedValue(makeUser() as any);

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe(VALID_EMAIL);
    // Sensitive fields must not be exposed
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it("returns 409 when email already exists", async () => {
    mockUserRepo.findByEmail.mockResolvedValue(makeUser() as any);

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when the email is invalid", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", password: VALID_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when password is too weak (missing uppercase)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: VALID_EMAIL, password: "weakpassword1@" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when password has no special character", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: VALID_EMAIL, password: "NoSpecial123" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when password has no number", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: VALID_EMAIL, password: "NoNumbers@Abc" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when email is missing from body", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ password: VALID_PASSWORD });

    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing from body", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: VALID_EMAIL });

    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────

describe("POST /api/v1/auth/login", () => {
  let hashedPassword: string;

  beforeAll(async () => {
    hashedPassword = await hashPassword(VALID_PASSWORD);
  });

  it("returns 200 with tokens and user for valid credentials", async () => {
    const user = makeUser({ passwordHash: hashedPassword, isVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user as any);
    mockUserRepo.resetLoginAttempts.mockResolvedValue(user as any);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens).toBeDefined();
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();
    expect(res.body.data.user).toBeDefined();
  });

  it("returns 401 when the user is not found", async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: VALID_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 for a wrong password", async () => {
    const user = makeUser({ passwordHash: hashedPassword, isVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user as any);
    mockUserRepo.incrementFailedLoginAttempts.mockResolvedValue({ ...user, failedLoginAttempts: 1 } as any);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: VALID_EMAIL, password: "WrongPassword1@" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 403 when account is not verified", async () => {
    const user = makeUser({ passwordHash: hashedPassword, isVerified: false });
    mockUserRepo.findByEmail.mockResolvedValue(user as any);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when account is inactive", async () => {
    const user = makeUser({ passwordHash: hashedPassword, isActive: false });
    mockUserRepo.findByEmail.mockResolvedValue(user as any);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(401);
  });

  it("returns 429 when account is locked", async () => {
    const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    const user = makeUser({ passwordHash: hashedPassword, lockedUntil, isVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user as any);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(429);
  });

  it("returns 400 when email is invalid", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "not-valid", password: VALID_PASSWORD });

    expect(res.status).toBe(400);
  });

  it("returns 400 when password is empty", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: VALID_EMAIL, password: "" });

    expect(res.status).toBe(400);
  });

  it("does not expose the user's passwordHash in the response", async () => {
    const user = makeUser({ passwordHash: hashedPassword, isVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user as any);
    mockUserRepo.resetLoginAttempts.mockResolvedValue(user as any);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: VALID_EMAIL, password: VALID_PASSWORD });

    expect(res.body.data?.user?.passwordHash).toBeUndefined();
  });
});

// ── POST /api/v1/auth/refresh ─────────────────────────────────────────────────

describe("POST /api/v1/auth/refresh", () => {
  it("returns 400 when refreshToken is missing from body", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when refreshToken is an empty string", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "" });

    expect(res.status).toBe(400);
  });

  it("returns 401 for an invalid (non-JWT) refresh token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "not-a-real-jwt-token" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 for a refresh token that is not in the database", async () => {
    const REFRESH_SECRET = "test-refresh-secret-minimum-32-characters-long";
    const fakeRefreshToken = jwt.sign(
      { userId: "user-uuid-001", tokenId: "tid-001", type: "refresh" },
      REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    mockTokenRepo.findRefreshToken.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: fakeRefreshToken });

    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/auth/verify-email ─────────────────────────────────────────────

describe("GET /api/v1/auth/verify-email", () => {
  it("returns 400 when token query param is missing", async () => {
    const res = await request(app).get("/api/v1/auth/verify-email");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when the verification token is not found in the database", async () => {
    mockTokenRepo.findEmailVerificationToken.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/auth/verify-email")
      .query({ token: "nonexistent-token" });

    expect(res.status).toBe(401);
  });

  it("returns 200 when a valid, unused, non-expired token is provided", async () => {
    const unverifiedUser = makeUser({ isVerified: false });
    mockTokenRepo.findEmailVerificationToken.mockResolvedValue(
      makeEmailVerificationRecord({ userId: "user-uuid-001" }) as any
    );
    mockTokenRepo.markEmailVerificationTokenUsed.mockResolvedValue(undefined as any);
    mockUserRepo.findById.mockResolvedValue(unverifiedUser as any);
    mockUserRepo.markEmailVerified.mockResolvedValue({ ...unverifiedUser, isVerified: true } as any);

    const res = await request(app)
      .get("/api/v1/auth/verify-email")
      .query({ token: "valid-token" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── GET /api/v1/auth/me (protected) ──────────────────────────────────────────

describe("GET /api/v1/auth/me", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const res = await request(app).get("/api/v1/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when Authorization header has wrong format", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "InvalidFormat token");

    expect(res.status).toBe(401);
  });

  it("returns 401 when Bearer token is invalid", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer not.a.valid.jwt");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when Bearer token is expired", async () => {
    const expiredToken = jwt.sign(
      { userId: "user-uuid-001", email: VALID_EMAIL, role: "USER", type: "access", jti: "j1" },
      ACCESS_SECRET,
      { expiresIn: -1 } as jwt.SignOptions
    );

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });

  it("returns 200 with user data for a valid, non-revoked access token", async () => {
    const user = makeUser();
    mockUserRepo.findById.mockResolvedValue(user as any);

    // Redis mock returns null for get() — token is not blacklisted, no revocation timestamp
    const validToken = makeAccessToken();

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
  });
});

// ── POST /api/v1/auth/forgot-password ────────────────────────────────────────

describe("POST /api/v1/auth/forgot-password", () => {
  it("returns 200 with a generic message regardless of whether email exists", async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 200 with a generic message when email is found", async () => {
    const user = makeUser();
    mockUserRepo.findByEmail.mockResolvedValue(user as any);
    mockTokenRepo.createPasswordResetToken.mockResolvedValue(makeEmailVerificationRecord() as any);

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: VALID_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 400 for an invalid email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "bad" });

    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/auth/resend-verification ────────────────────────────────────

describe("POST /api/v1/auth/resend-verification", () => {
  it("returns 200 with a generic message for any valid email (user not found)", async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: VALID_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 200 when user exists and is unverified (queues email)", async () => {
    const user = makeUser({ isVerified: false });
    mockUserRepo.findByEmail.mockResolvedValue(user as any);
    mockTokenRepo.createEmailVerificationToken.mockResolvedValue(makeEmailVerificationRecord() as any);

    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: VALID_EMAIL });

    expect(res.status).toBe(200);
  });

  it("returns 400 for an invalid email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: "not-valid" });

    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/auth/reset-password ─────────────────────────────────────────

describe("POST /api/v1/auth/reset-password", () => {
  it("returns 400 when token is missing", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ newPassword: VALID_PASSWORD });

    expect(res.status).toBe(400);
  });

  it("returns 400 when newPassword is weak", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "some-token", newPassword: "weak" });

    expect(res.status).toBe(400);
  });

  it("returns 401 when reset token is not in database", async () => {
    mockTokenRepo.findPasswordResetToken.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "invalid-token", newPassword: VALID_PASSWORD });

    expect(res.status).toBe(401);
  });

  it("returns 200 on successful password reset", async () => {
    const user = makeUser();
    mockTokenRepo.findPasswordResetToken.mockResolvedValue(
      makeEmailVerificationRecord({ userId: "user-uuid-001" }) as any
    );
    mockTokenRepo.markPasswordResetTokenUsed.mockResolvedValue(undefined as any);
    mockUserRepo.findById.mockResolvedValue(user as any);
    mockUserRepo.getPasswordHistory.mockResolvedValue([]);
    mockUserRepo.updatePassword.mockResolvedValue(user as any);
    mockTokenRepo.revokeAllUserRefreshTokens.mockResolvedValue(1 as any);

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "valid-reset-token", newPassword: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Health endpoints ──────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("response includes service name", async () => {
    const res = await request(app).get("/health");
    expect(res.body.service).toBe("auth-service");
  });

  it("response includes a timestamp", async () => {
    const res = await request(app).get("/health");
    expect(res.body.timestamp).toBeDefined();
    expect(() => new Date(res.body.timestamp)).not.toThrow();
  });
});

describe("GET /health/ready", () => {
  it("returns 200 with status ready when DB and Redis are healthy", async () => {
    const { checkDatabaseHealth } = require("@/config/database");
    const { checkRedisHealth } = require("@/config/redis");
    (checkDatabaseHealth as jest.Mock).mockResolvedValue(true);
    (checkRedisHealth as jest.Mock).mockResolvedValue(true);

    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });

  it("response includes checks for database and redis", async () => {
    const { checkDatabaseHealth } = require("@/config/database");
    const { checkRedisHealth } = require("@/config/redis");
    (checkDatabaseHealth as jest.Mock).mockResolvedValue(true);
    (checkRedisHealth as jest.Mock).mockResolvedValue(true);

    const res = await request(app).get("/health/ready");

    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.database).toBe("ok");
    expect(res.body.checks.redis).toBe("ok");
  });

  it("returns 503 degraded status when database is unhealthy", async () => {
    const { checkDatabaseHealth } = require("@/config/database");
    const { checkRedisHealth } = require("@/config/redis");
    (checkDatabaseHealth as jest.Mock).mockResolvedValue(false);
    (checkRedisHealth as jest.Mock).mockResolvedValue(true);

    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.checks.database).toBe("error");
  });

  it("returns 503 degraded status when redis is unhealthy", async () => {
    const { checkDatabaseHealth } = require("@/config/database");
    const { checkRedisHealth } = require("@/config/redis");
    (checkDatabaseHealth as jest.Mock).mockResolvedValue(true);
    (checkRedisHealth as jest.Mock).mockResolvedValue(false);

    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(503);
    expect(res.body.checks.redis).toBe("error");
  });
});

// ── 404 handling ──────────────────────────────────────────────────────────────

describe("Unknown routes", () => {
  it("returns 404 for an unknown auth path", async () => {
    const res = await request(app).get("/api/v1/auth/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 404 for a completely unknown route", async () => {
    const res = await request(app).get("/no-such-endpoint");
    expect(res.status).toBe(404);
  });
});
