import crypto from "crypto";
import { OrgApiKey, OrgPlan } from "@prisma/client";
import { orgApiKeyRepository } from "@/repositories/org-api-key.repository";
import { orgRepository } from "@/repositories/org.repository";
import { auditService } from "@/services/audit.service";
import { PLAN_LIMITS } from "@/constants/plans.constants";
import { NotFoundError, AuthorizationError, ValidationError } from "@/utils/errors";
import { AuditAction } from "@/constants";
import type { RequestMeta } from "@/services/auth.service";

function generateKey(testMode: boolean): { raw: string; hash: string; prefix: string } {
  const randomBytes = crypto.randomBytes(32).toString("hex");
  const raw = `${testMode ? "sk_test_" : "sk_live_"}${randomBytes}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 16);
  return { raw, hash, prefix };
}

export class OrgApiKeyService {
  async create(
    organizationId: string,
    data: { name: string; scopes: string[]; testMode: boolean; expiresAt?: Date },
    createdBy: string,
    meta: RequestMeta = {}
  ): Promise<{ apiKey: Omit<OrgApiKey, "keyHash">; rawKey: string }> {
    const org = await orgRepository.findById(organizationId);
    if (!org) throw new NotFoundError("Organization not found");

    const limits = PLAN_LIMITS[org.plan as OrgPlan];
    const count = await orgApiKeyRepository.countByOrg(organizationId);
    if (count >= limits.maxApiKeys) {
      throw new ValidationError(
        `Your plan allows a maximum of ${limits.maxApiKeys} API keys. Upgrade to create more.`
      );
    }

    const { raw, hash, prefix } = generateKey(data.testMode);

    const apiKey = await orgApiKeyRepository.create({
      organizationId,
      name: data.name,
      keyHash: hash,
      prefix,
      scopes: data.scopes,
      testMode: data.testMode,
      expiresAt: data.expiresAt,
      createdBy,
    });

    await auditService.log({
      userId: createdBy,
      action: AuditAction.API_KEY_CREATED,
      details: { organizationId, keyId: apiKey.id, name: apiKey.name, testMode: apiKey.testMode },
      ...meta,
    });

    const { keyHash: _, ...safeKey } = apiKey;
    return { apiKey: safeKey, rawKey: raw };
  }

  async list(organizationId: string): Promise<Omit<OrgApiKey, "keyHash">[]> {
    const keys = await orgApiKeyRepository.listByOrg(organizationId);
    return keys.map(({ keyHash: _, ...k }) => k);
  }

  async update(
    id: string,
    organizationId: string,
    data: { name?: string; scopes?: string[]; expiresAt?: Date | null },
    userId: string,
    meta: RequestMeta = {}
  ): Promise<Omit<OrgApiKey, "keyHash">> {
    const key = await orgApiKeyRepository.findById(id);
    if (!key) throw new NotFoundError("API key not found");
    if (key.organizationId !== organizationId) throw new AuthorizationError("Key does not belong to this organization");

    const updated = await orgApiKeyRepository.update(id, data);

    await auditService.log({
      userId,
      action: AuditAction.API_KEY_UPDATED,
      details: { organizationId, keyId: id, changes: data },
      ...meta,
    });

    const { keyHash: _, ...safeKey } = updated;
    return safeKey;
  }

  async revoke(id: string, organizationId: string, userId: string, meta: RequestMeta = {}): Promise<void> {
    const key = await orgApiKeyRepository.findById(id);
    if (!key) throw new NotFoundError("API key not found");
    if (key.organizationId !== organizationId) throw new AuthorizationError("Key does not belong to this organization");

    await orgApiKeyRepository.delete(id);

    await auditService.log({
      userId,
      action: AuditAction.API_KEY_REVOKED,
      details: { organizationId, keyId: id, name: key.name },
      ...meta,
    });
  }

  async authenticateKey(rawKey: string): Promise<OrgApiKey | null> {
    const hash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const key = await orgApiKeyRepository.findByHash(hash);
    if (!key) return null;
    if (key.expiresAt && key.expiresAt < new Date()) return null;
    // Fire-and-forget last used update
    orgApiKeyRepository.touchLastUsed(key.id).catch(() => undefined);
    return key;
  }
}

export const orgApiKeyService = new OrgApiKeyService();
