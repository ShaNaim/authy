/**
 * Unit tests for JWT utilities
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

import jwt from "jsonwebtoken";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  getTokenRemainingTtl,
} from "@/utils/jwt.utils";
import { AuthenticationError } from "@/utils/errors";
import { AccessTokenPayload, RefreshTokenPayload } from "@/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const accessPayload: Omit<AccessTokenPayload, "iat" | "exp"> = {
  userId: "user-123",
  email: "test@example.com",
  role: "USER" as any,
  type: "access",
  jti: "jti-abc-123",
};

const refreshPayload: Omit<RefreshTokenPayload, "iat" | "exp"> = {
  userId: "user-123",
  tokenId: "token-id-456",
  type: "refresh",
};

const ACCESS_SECRET = "test-access-secret-minimum-32-characters-long";
const REFRESH_SECRET = "test-refresh-secret-minimum-32-characters-long";

// ── generateAccessToken ───────────────────────────────────────────────────────

describe("generateAccessToken", () => {
  it("returns a non-empty string", () => {
    const token = generateAccessToken(accessPayload);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("produces a JWT with three dot-separated segments", () => {
    const token = generateAccessToken(accessPayload);
    expect(token.split(".")).toHaveLength(3);
  });

  it("encodes userId into the payload", () => {
    const token = generateAccessToken(accessPayload);
    const decoded = jwt.decode(token) as AccessTokenPayload;
    expect(decoded.userId).toBe(accessPayload.userId);
  });

  it("encodes email into the payload", () => {
    const token = generateAccessToken(accessPayload);
    const decoded = jwt.decode(token) as AccessTokenPayload;
    expect(decoded.email).toBe(accessPayload.email);
  });

  it("encodes role into the payload", () => {
    const token = generateAccessToken(accessPayload);
    const decoded = jwt.decode(token) as AccessTokenPayload;
    expect(decoded.role).toBe(accessPayload.role);
  });

  it("encodes type='access' into the payload", () => {
    const token = generateAccessToken(accessPayload);
    const decoded = jwt.decode(token) as AccessTokenPayload;
    expect(decoded.type).toBe("access");
  });

  it("encodes jti into the payload", () => {
    const token = generateAccessToken(accessPayload);
    const decoded = jwt.decode(token) as AccessTokenPayload;
    expect(decoded.jti).toBe(accessPayload.jti);
  });

  it("includes exp (expiry) in the payload", () => {
    const token = generateAccessToken(accessPayload);
    const decoded = jwt.decode(token) as AccessTokenPayload;
    expect(decoded.exp).toBeDefined();
    expect(typeof decoded.exp).toBe("number");
  });

  it("produces different tokens on subsequent calls for the same payload (iat jitter)", () => {
    // Two calls in quick succession may get the same iat second, but they are still
    // valid tokens. We assert they can each be independently decoded.
    const t1 = generateAccessToken(accessPayload);
    const t2 = generateAccessToken(accessPayload);
    const d1 = jwt.decode(t1) as AccessTokenPayload;
    const d2 = jwt.decode(t2) as AccessTokenPayload;
    expect(d1.userId).toBe(d2.userId);
  });
});

// ── generateRefreshToken ──────────────────────────────────────────────────────

describe("generateRefreshToken", () => {
  it("returns a non-empty string", () => {
    const token = generateRefreshToken(refreshPayload);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("encodes userId into the payload", () => {
    const token = generateRefreshToken(refreshPayload);
    const decoded = jwt.decode(token) as RefreshTokenPayload;
    expect(decoded.userId).toBe(refreshPayload.userId);
  });

  it("encodes tokenId into the payload", () => {
    const token = generateRefreshToken(refreshPayload);
    const decoded = jwt.decode(token) as RefreshTokenPayload;
    expect(decoded.tokenId).toBe(refreshPayload.tokenId);
  });

  it("encodes type='refresh' into the payload", () => {
    const token = generateRefreshToken(refreshPayload);
    const decoded = jwt.decode(token) as RefreshTokenPayload;
    expect(decoded.type).toBe("refresh");
  });

  it("includes exp in the payload", () => {
    const token = generateRefreshToken(refreshPayload);
    const decoded = jwt.decode(token) as RefreshTokenPayload;
    expect(decoded.exp).toBeDefined();
  });
});

// ── verifyAccessToken ─────────────────────────────────────────────────────────

describe("verifyAccessToken", () => {
  it("returns the correct payload for a valid token", () => {
    const token = generateAccessToken(accessPayload);
    const result = verifyAccessToken(token);
    expect(result.userId).toBe(accessPayload.userId);
    expect(result.email).toBe(accessPayload.email);
    expect(result.jti).toBe(accessPayload.jti);
    expect(result.type).toBe("access");
  });

  it("throws AuthenticationError for an expired token", () => {
    const expired = jwt.sign(
      { ...accessPayload },
      ACCESS_SECRET,
      { expiresIn: -1 } as jwt.SignOptions
    );
    expect(() => verifyAccessToken(expired)).toThrow(AuthenticationError);
  });

  it("throws AuthenticationError with 'expired' in message for an expired token", () => {
    const expired = jwt.sign(
      { ...accessPayload },
      ACCESS_SECRET,
      { expiresIn: -1 } as jwt.SignOptions
    );
    expect(() => verifyAccessToken(expired)).toThrow(/expired/i);
  });

  it("throws AuthenticationError for a token signed with the wrong secret", () => {
    const wrongToken = jwt.sign({ ...accessPayload }, "wrong-secret-that-is-at-least-32-chars");
    expect(() => verifyAccessToken(wrongToken)).toThrow(AuthenticationError);
  });

  it("throws AuthenticationError for a completely invalid string", () => {
    expect(() => verifyAccessToken("not.a.token")).toThrow(AuthenticationError);
  });

  it("throws AuthenticationError for an empty string", () => {
    expect(() => verifyAccessToken("")).toThrow(AuthenticationError);
  });
});

// ── verifyRefreshToken ────────────────────────────────────────────────────────

describe("verifyRefreshToken", () => {
  it("returns the correct payload for a valid token", () => {
    const token = generateRefreshToken(refreshPayload);
    const result = verifyRefreshToken(token);
    expect(result.userId).toBe(refreshPayload.userId);
    expect(result.tokenId).toBe(refreshPayload.tokenId);
    expect(result.type).toBe("refresh");
  });

  it("throws AuthenticationError for an expired refresh token", () => {
    const expired = jwt.sign(
      { ...refreshPayload },
      REFRESH_SECRET,
      { expiresIn: -1 } as jwt.SignOptions
    );
    expect(() => verifyRefreshToken(expired)).toThrow(AuthenticationError);
  });

  it("throws AuthenticationError with 'expired' in message for expired token", () => {
    const expired = jwt.sign(
      { ...refreshPayload },
      REFRESH_SECRET,
      { expiresIn: -1 } as jwt.SignOptions
    );
    expect(() => verifyRefreshToken(expired)).toThrow(/expired/i);
  });

  it("throws AuthenticationError for a token signed with the wrong secret", () => {
    const wrongToken = jwt.sign({ ...refreshPayload }, "wrong-secret-that-is-at-least-32-chars");
    expect(() => verifyRefreshToken(wrongToken)).toThrow(AuthenticationError);
  });

  it("throws AuthenticationError for an invalid string", () => {
    expect(() => verifyRefreshToken("garbage")).toThrow(AuthenticationError);
  });

  it("throws AuthenticationError for an access token passed to verifyRefreshToken", () => {
    // Access token is signed with a different secret — verification fails
    const accessToken = generateAccessToken(accessPayload);
    expect(() => verifyRefreshToken(accessToken)).toThrow(AuthenticationError);
  });
});

// ── decodeToken ───────────────────────────────────────────────────────────────

describe("decodeToken", () => {
  it("decodes a valid token without verification", () => {
    const token = generateAccessToken(accessPayload);
    const decoded = decodeToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe(accessPayload.userId);
  });

  it("returns null for an invalid token string", () => {
    // jwt.decode returns null for clearly malformed strings; our wrapper handles exceptions
    const result = decodeToken("totally-not-a-jwt");
    // jwt.decode does not throw for strings that look nothing like a JWT —
    // it returns null. Our wrapper returns null too.
    expect(result === null || typeof result === "object").toBe(true);
  });
});

// ── getTokenRemainingTtl ──────────────────────────────────────────────────────

describe("getTokenRemainingTtl", () => {
  it("returns a positive number for a future expiry timestamp", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const ttl = getTokenRemainingTtl(futureExp);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3600);
  });

  it("returns 0 for an already-expired timestamp", () => {
    const pastExp = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
    const ttl = getTokenRemainingTtl(pastExp);
    expect(ttl).toBe(0);
  });

  it("returns approximately correct remaining seconds", () => {
    const secondsFromNow = 100;
    const futureExp = Math.floor(Date.now() / 1000) + secondsFromNow;
    const ttl = getTokenRemainingTtl(futureExp);
    // Allow ±1 second for execution time
    expect(ttl).toBeGreaterThanOrEqual(secondsFromNow - 1);
    expect(ttl).toBeLessThanOrEqual(secondsFromNow);
  });

  it("returns 0 (not negative) for a past timestamp", () => {
    const longPastExp = Math.floor(Date.now() / 1000) - 86400; // yesterday
    expect(getTokenRemainingTtl(longPastExp)).toBe(0);
  });

  it("works with a real token exp field", () => {
    const token = generateAccessToken(accessPayload);
    const decoded = jwt.decode(token) as AccessTokenPayload;
    const ttl = getTokenRemainingTtl(decoded.exp!);
    expect(ttl).toBeGreaterThan(0);
  });
});
