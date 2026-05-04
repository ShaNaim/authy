/**
 * Unit tests for password utilities
 *
 * We set BCRYPT_ROUNDS=4 before the config module is loaded so that
 * the test suite runs fast (low cost hashing) without touching production defaults.
 */

// Set all required env vars before any module import so env.ts parses cleanly
process.env.BCRYPT_ROUNDS = "4";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.JWT_ACCESS_SECRET = "test-access-secret-minimum-32-characters-long";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-minimum-32-characters-long";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.INTERNAL_API_KEY = "test-internal-api-key-minimum-32-characters";

import {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
} from "@/utils/password.utils";

describe("password.utils", () => {
  // ── hashPassword ──────────────────────────────────────────────────────────

  describe("hashPassword", () => {
    it("returns a string", async () => {
      const hash = await hashPassword("ValidPass1@");
      expect(typeof hash).toBe("string");
    });

    it("does not return the original password", async () => {
      const password = "ValidPass1@";
      const hash = await hashPassword(password);
      expect(hash).not.toBe(password);
    });

    it("produces different hashes for the same password on subsequent calls (salt)", async () => {
      const hash1 = await hashPassword("ValidPass1@");
      const hash2 = await hashPassword("ValidPass1@");
      expect(hash1).not.toBe(hash2);
    });

    it("returns a bcrypt hash string (starts with $2b$)", async () => {
      const hash = await hashPassword("ValidPass1@");
      expect(hash.startsWith("$2")).toBe(true);
    });
  });

  // ── comparePassword ───────────────────────────────────────────────────────

  describe("comparePassword", () => {
    it("returns true when password matches the hash", async () => {
      const password = "ValidPass1@";
      const hash = await hashPassword(password);
      const result = await comparePassword(password, hash);
      expect(result).toBe(true);
    });

    it("returns false when password does not match the hash", async () => {
      const hash = await hashPassword("ValidPass1@");
      const result = await comparePassword("WrongPassword1@", hash);
      expect(result).toBe(false);
    });

    it("returns false for an empty string against a real hash", async () => {
      const hash = await hashPassword("ValidPass1@");
      const result = await comparePassword("", hash);
      expect(result).toBe(false);
    });
  });

  // ── validatePasswordStrength ──────────────────────────────────────────────

  describe("validatePasswordStrength", () => {
    it("returns valid=true for a password meeting all requirements", () => {
      const result = validatePasswordStrength("ValidPass1@");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns valid=true for a password with multiple special characters", () => {
      const result = validatePasswordStrength("Complex@Pass1!Extra");
      expect(result.valid).toBe(true);
    });

    describe("minimum length rule", () => {
      it("fails with a password shorter than 8 characters", () => {
        const result = validatePasswordStrength("Sh1@");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("at least"))).toBe(true);
      });

      it("passes with exactly 8 characters meeting all rules", () => {
        const result = validatePasswordStrength("Val1@bcd");
        expect(result.valid).toBe(true);
      });
    });

    describe("maximum length rule", () => {
      it("fails with a password longer than 128 characters", () => {
        const tooLong = "A1@" + "a".repeat(127); // 130 chars
        const result = validatePasswordStrength(tooLong);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("at most"))).toBe(true);
      });

      it("passes with exactly 128 characters", () => {
        // 3 required chars + 125 lowercase = 128
        const exactly128 = "A1@" + "a".repeat(125);
        const result = validatePasswordStrength(exactly128);
        expect(result.valid).toBe(true);
      });
    });

    describe("uppercase letter rule", () => {
      it("fails when no uppercase letter is present", () => {
        const result = validatePasswordStrength("nouppercase1@");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("uppercase"))).toBe(true);
      });

      it("does not report uppercase error when uppercase is present", () => {
        const result = validatePasswordStrength("ValidPass1@");
        expect(result.errors.some((e) => e.includes("uppercase"))).toBe(false);
      });
    });

    describe("lowercase letter rule", () => {
      it("fails when no lowercase letter is present", () => {
        const result = validatePasswordStrength("NOLOWERCASE1@");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("lowercase"))).toBe(true);
      });

      it("does not report lowercase error when lowercase is present", () => {
        const result = validatePasswordStrength("ValidPass1@");
        expect(result.errors.some((e) => e.includes("lowercase"))).toBe(false);
      });
    });

    describe("number rule", () => {
      it("fails when no number is present", () => {
        const result = validatePasswordStrength("NoNumbers@Abc");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("number"))).toBe(true);
      });

      it("does not report number error when a digit is present", () => {
        const result = validatePasswordStrength("ValidPass1@");
        expect(result.errors.some((e) => e.includes("number"))).toBe(false);
      });
    });

    describe("special character rule", () => {
      it("fails when no special character is present", () => {
        const result = validatePasswordStrength("NoSpecial123Abc");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("special character"))).toBe(true);
      });

      it("does not report special char error when special char is present", () => {
        const result = validatePasswordStrength("ValidPass1@");
        expect(result.errors.some((e) => e.includes("special character"))).toBe(false);
      });
    });

    describe("multiple rule violations", () => {
      it("reports multiple errors when several rules are violated", () => {
        // Only lowercase letters — violates uppercase, number, special char
        const result = validatePasswordStrength("alllowercase");
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
      });

      it("returns empty errors array for a valid password", () => {
        const result = validatePasswordStrength("SuperSecret1@");
        expect(result.errors).toEqual([]);
      });
    });
  });
});
