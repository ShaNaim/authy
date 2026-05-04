import crypto from "crypto";

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateExpiryDate(ms: number): Date {
  return new Date(Date.now() + ms);
}

export function isExpired(date: Date): boolean {
  return date < new Date();
}
