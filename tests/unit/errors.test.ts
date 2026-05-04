/**
 * Unit tests for custom error classes
 * These are plain ES6 classes with no external dependencies.
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
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  AccountLockedError,
  DatabaseError,
} from "@/utils/errors";

// ── AppError (base) ───────────────────────────────────────────────────────────

describe("AppError", () => {
  const err = new AppError("Something went wrong", 500, "INTERNAL_ERROR", { context: "test" });

  it("is an instance of Error", () => {
    expect(err).toBeInstanceOf(Error);
  });

  it("is an instance of AppError", () => {
    expect(err).toBeInstanceOf(AppError);
  });

  it("has the correct message", () => {
    expect(err.message).toBe("Something went wrong");
  });

  it("has the correct statusCode", () => {
    expect(err.statusCode).toBe(500);
  });

  it("has the correct errorCode", () => {
    expect(err.errorCode).toBe("INTERNAL_ERROR");
  });

  it("has isOperational=true", () => {
    expect(err.isOperational).toBe(true);
  });

  it("stores the details property", () => {
    expect(err.details).toEqual({ context: "test" });
  });

  it("has a stack trace", () => {
    expect(err.stack).toBeDefined();
  });

  it("has the constructor name as the error name", () => {
    expect(err.name).toBe("AppError");
  });

  it("allows undefined details", () => {
    const noDetails = new AppError("msg", 400, "CODE");
    expect(noDetails.details).toBeUndefined();
  });
});

// ── ValidationError ───────────────────────────────────────────────────────────

describe("ValidationError", () => {
  const err = new ValidationError("Validation failed", ["field is required"]);

  it("is an instance of AppError", () => {
    expect(err).toBeInstanceOf(AppError);
  });

  it("has statusCode 400", () => {
    expect(err.statusCode).toBe(400);
  });

  it("has errorCode VALIDATION_ERROR", () => {
    expect(err.errorCode).toBe("VALIDATION_ERROR");
  });

  it("has the correct message", () => {
    expect(err.message).toBe("Validation failed");
  });

  it("stores details", () => {
    expect(err.details).toEqual(["field is required"]);
  });

  it("has isOperational=true", () => {
    expect(err.isOperational).toBe(true);
  });
});

// ── AuthenticationError ───────────────────────────────────────────────────────

describe("AuthenticationError", () => {
  it("has statusCode 401", () => {
    expect(new AuthenticationError().statusCode).toBe(401);
  });

  it("has errorCode AUTHENTICATION_ERROR", () => {
    expect(new AuthenticationError().errorCode).toBe("AUTHENTICATION_ERROR");
  });

  it("uses default message 'Authentication required' when no message is passed", () => {
    expect(new AuthenticationError().message).toBe("Authentication required");
  });

  it("uses the custom message when one is provided", () => {
    const err = new AuthenticationError("Token has expired");
    expect(err.message).toBe("Token has expired");
  });

  it("is an instance of AppError", () => {
    expect(new AuthenticationError()).toBeInstanceOf(AppError);
  });

  it("has isOperational=true", () => {
    expect(new AuthenticationError().isOperational).toBe(true);
  });
});

// ── AuthorizationError ────────────────────────────────────────────────────────

describe("AuthorizationError", () => {
  it("has statusCode 403", () => {
    expect(new AuthorizationError().statusCode).toBe(403);
  });

  it("has errorCode AUTHORIZATION_ERROR", () => {
    expect(new AuthorizationError().errorCode).toBe("AUTHORIZATION_ERROR");
  });

  it("uses default message when no message is passed", () => {
    expect(new AuthorizationError().message).toBe("Insufficient permissions");
  });

  it("uses the custom message when provided", () => {
    const err = new AuthorizationError("Admin only");
    expect(err.message).toBe("Admin only");
  });

  it("is an instance of AppError", () => {
    expect(new AuthorizationError()).toBeInstanceOf(AppError);
  });
});

// ── NotFoundError ─────────────────────────────────────────────────────────────

describe("NotFoundError", () => {
  it("has statusCode 404", () => {
    expect(new NotFoundError().statusCode).toBe(404);
  });

  it("has errorCode NOT_FOUND_ERROR", () => {
    expect(new NotFoundError().errorCode).toBe("NOT_FOUND_ERROR");
  });

  it("uses default message when no message is passed", () => {
    expect(new NotFoundError().message).toBe("Resource not found");
  });

  it("uses the custom message when provided", () => {
    const err = new NotFoundError("User not found");
    expect(err.message).toBe("User not found");
  });

  it("is an instance of AppError", () => {
    expect(new NotFoundError()).toBeInstanceOf(AppError);
  });
});

// ── ConflictError ─────────────────────────────────────────────────────────────

describe("ConflictError", () => {
  const err = new ConflictError("Email already in use");

  it("has statusCode 409", () => {
    expect(err.statusCode).toBe(409);
  });

  it("has errorCode CONFLICT_ERROR", () => {
    expect(err.errorCode).toBe("CONFLICT_ERROR");
  });

  it("has the correct message", () => {
    expect(err.message).toBe("Email already in use");
  });

  it("is an instance of AppError", () => {
    expect(err).toBeInstanceOf(AppError);
  });

  it("has isOperational=true", () => {
    expect(err.isOperational).toBe(true);
  });
});

// ── TooManyRequestsError ──────────────────────────────────────────────────────

describe("TooManyRequestsError", () => {
  it("has statusCode 429", () => {
    expect(new TooManyRequestsError().statusCode).toBe(429);
  });

  it("has errorCode RATE_LIMIT_ERROR", () => {
    expect(new TooManyRequestsError().errorCode).toBe("RATE_LIMIT_ERROR");
  });

  it("uses default message", () => {
    expect(new TooManyRequestsError().message).toBe("Too many requests, please try again later");
  });

  it("uses a custom message when provided", () => {
    const err = new TooManyRequestsError("Slow down!");
    expect(err.message).toBe("Slow down!");
  });

  it("is an instance of AppError", () => {
    expect(new TooManyRequestsError()).toBeInstanceOf(AppError);
  });
});

// ── AccountLockedError ────────────────────────────────────────────────────────

describe("AccountLockedError", () => {
  const lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
  const err = new AccountLockedError(lockedUntil);

  it("has statusCode 429", () => {
    expect(err.statusCode).toBe(429);
  });

  it("has errorCode RATE_LIMIT_ERROR", () => {
    expect(err.errorCode).toBe("RATE_LIMIT_ERROR");
  });

  it("stores the lockedUntil Date", () => {
    expect(err.lockedUntil).toEqual(lockedUntil);
  });

  it("message includes the word 'locked'", () => {
    expect(err.message.toLowerCase()).toContain("locked");
  });

  it("message includes the number of minutes", () => {
    expect(err.message).toMatch(/\d+ minute/);
  });

  it("is an instance of AppError", () => {
    expect(err).toBeInstanceOf(AppError);
  });

  it("has isOperational=true", () => {
    expect(err.isOperational).toBe(true);
  });

  it("calculates minutes correctly for a 5-minute lockout", () => {
    const fiveMin = new Date(Date.now() + 5 * 60 * 1000);
    const e = new AccountLockedError(fiveMin);
    expect(e.message).toContain("5 minute");
  });

  it("rounds up partial minutes (ceil behaviour)", () => {
    // 90 seconds = 1.5 minutes → should say 2 minute(s)
    const ninetySeconds = new Date(Date.now() + 90 * 1000);
    const e = new AccountLockedError(ninetySeconds);
    expect(e.message).toContain("2 minute");
  });
});

// ── DatabaseError ─────────────────────────────────────────────────────────────

describe("DatabaseError", () => {
  it("has statusCode 500", () => {
    expect(new DatabaseError().statusCode).toBe(500);
  });

  it("has errorCode DATABASE_ERROR", () => {
    expect(new DatabaseError().errorCode).toBe("DATABASE_ERROR");
  });

  it("uses default message", () => {
    expect(new DatabaseError().message).toBe("A database error occurred");
  });

  it("uses a custom message when provided", () => {
    const err = new DatabaseError("Connection timeout");
    expect(err.message).toBe("Connection timeout");
  });

  it("is an instance of AppError", () => {
    expect(new DatabaseError()).toBeInstanceOf(AppError);
  });

  it("has isOperational=true", () => {
    expect(new DatabaseError().isOperational).toBe(true);
  });
});

// ── Cross-cutting: instanceof checks ─────────────────────────────────────────

describe("Error class hierarchy", () => {
  const errors = [
    new ValidationError("v"),
    new AuthenticationError(),
    new AuthorizationError(),
    new NotFoundError(),
    new ConflictError("c"),
    new TooManyRequestsError(),
    new DatabaseError(),
    new AccountLockedError(new Date(Date.now() + 60000)),
  ];

  errors.forEach((e) => {
    it(`${e.constructor.name} is an instance of AppError`, () => {
      expect(e).toBeInstanceOf(AppError);
    });

    it(`${e.constructor.name} is an instance of Error`, () => {
      expect(e).toBeInstanceOf(Error);
    });

    it(`${e.constructor.name} has isOperational=true`, () => {
      expect(e.isOperational).toBe(true);
    });
  });
});
