/**
 * Unit tests for token utilities
 * These are pure crypto helpers — no env or external dependencies needed.
 */

import {
  generateSecureToken,
  hashToken,
  generateExpiryDate,
  isExpired,
} from "@/utils/token.utils";

describe("token.utils", () => {
  // ── generateSecureToken ───────────────────────────────────────────────────

  describe("generateSecureToken", () => {
    it("returns a string", () => {
      const token = generateSecureToken();
      expect(typeof token).toBe("string");
    });

    it("returns a hex string of 64 characters by default (32 bytes → 64 hex chars)", () => {
      const token = generateSecureToken();
      expect(token).toHaveLength(64);
    });

    it("returns only hex characters (0-9, a-f)", () => {
      const token = generateSecureToken();
      expect(/^[0-9a-f]+$/i.test(token)).toBe(true);
    });

    it("returns 128 hex chars when called with 64 bytes", () => {
      const token = generateSecureToken(64);
      expect(token).toHaveLength(128);
    });

    it("returns 16 hex chars when called with 8 bytes", () => {
      const token = generateSecureToken(8);
      expect(token).toHaveLength(16);
    });

    it("produces a different value on each call (cryptographic randomness)", () => {
      const tokens = new Set(Array.from({ length: 10 }, () => generateSecureToken()));
      expect(tokens.size).toBe(10);
    });

    it("two tokens generated in sequence are different", () => {
      const t1 = generateSecureToken();
      const t2 = generateSecureToken();
      expect(t1).not.toBe(t2);
    });
  });

  // ── hashToken ─────────────────────────────────────────────────────────────

  describe("hashToken", () => {
    it("returns a string", () => {
      const hash = hashToken("some-token");
      expect(typeof hash).toBe("string");
    });

    it("returns a 64-character SHA-256 hex string", () => {
      const hash = hashToken("some-token");
      expect(hash).toHaveLength(64);
    });

    it("returns only hex characters", () => {
      const hash = hashToken("any-input");
      expect(/^[0-9a-f]+$/i.test(hash)).toBe(true);
    });

    it("produces the same hash for the same input (deterministic)", () => {
      const input = "consistent-input";
      expect(hashToken(input)).toBe(hashToken(input));
    });

    it("produces different hashes for different inputs", () => {
      expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
    });

    it("is sensitive to a single character change", () => {
      expect(hashToken("token-abc")).not.toBe(hashToken("token-abC"));
    });

    it("hashes an empty string without throwing", () => {
      const hash = hashToken("");
      expect(hash).toHaveLength(64);
    });

    it("produces the known SHA-256 hash of 'abc'", () => {
      // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
      expect(hashToken("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      );
    });
  });

  // ── generateExpiryDate ────────────────────────────────────────────────────

  describe("generateExpiryDate", () => {
    it("returns a Date object", () => {
      const date = generateExpiryDate(60000);
      expect(date).toBeInstanceOf(Date);
    });

    it("returns a date in the future for a positive ms value", () => {
      const before = Date.now();
      const date = generateExpiryDate(60000); // 1 minute
      const after = Date.now();
      expect(date.getTime()).toBeGreaterThan(before);
      expect(date.getTime()).toBeLessThanOrEqual(after + 60000);
    });

    it("returns a date in the past for a negative ms value", () => {
      const date = generateExpiryDate(-60000); // 1 minute ago
      expect(date.getTime()).toBeLessThan(Date.now());
    });

    it("returns a date approximately 1 hour ahead for 3600000 ms", () => {
      const ms = 3600000;
      const now = Date.now();
      const date = generateExpiryDate(ms);
      // Allow ±50ms for test execution
      expect(date.getTime()).toBeGreaterThanOrEqual(now + ms - 50);
      expect(date.getTime()).toBeLessThanOrEqual(now + ms + 50);
    });

    it("returns a date approximately 24 hours ahead for 86400000 ms", () => {
      const ms = 86400000;
      const now = Date.now();
      const date = generateExpiryDate(ms);
      expect(date.getTime()).toBeGreaterThanOrEqual(now + ms - 50);
      expect(date.getTime()).toBeLessThanOrEqual(now + ms + 50);
    });

    it("returns a date at exactly now for 0 ms", () => {
      const now = Date.now();
      const date = generateExpiryDate(0);
      // Allow ±10ms for execution
      expect(Math.abs(date.getTime() - now)).toBeLessThan(10);
    });
  });

  // ── isExpired ─────────────────────────────────────────────────────────────

  describe("isExpired", () => {
    it("returns true for a date in the past", () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago
      expect(isExpired(pastDate)).toBe(true);
    });

    it("returns false for a date in the future", () => {
      const futureDate = new Date(Date.now() + 60000); // 1 minute from now
      expect(isExpired(futureDate)).toBe(false);
    });

    it("returns true for a date far in the past", () => {
      const longAgo = new Date("2000-01-01T00:00:00.000Z");
      expect(isExpired(longAgo)).toBe(true);
    });

    it("returns false for a date far in the future", () => {
      const farFuture = new Date("2099-12-31T23:59:59.999Z");
      expect(isExpired(farFuture)).toBe(false);
    });

    it("works correctly with generateExpiryDate producing a future date", () => {
      const future = generateExpiryDate(60000);
      expect(isExpired(future)).toBe(false);
    });

    it("works correctly with generateExpiryDate producing a past date", () => {
      const past = generateExpiryDate(-60000);
      expect(isExpired(past)).toBe(true);
    });
  });
});
