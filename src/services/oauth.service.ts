import crypto from "crypto";
import jwt from "jsonwebtoken";
import { OAuthApp, OAuthGrantType } from "@prisma/client";
import { oauthRepository } from "@/repositories/oauth.repository";
import { orgRepository } from "@/repositories/org.repository";
import { userRepository } from "@/repositories/user.repository";
import { auditService } from "@/services/audit.service";
import { cacheService } from "@/services/cache.service";
import { PLAN_LIMITS } from "@/constants/plans.constants";
import { getOAuthKeyPair } from "@/utils/oauth-keys";
import { comparePassword } from "@/utils/password.utils";
import {
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from "@/utils/errors";
import { AuditAction } from "@/constants";
import type { RequestMeta } from "@/services/auth.service";

const CODE_TTL_SECONDS = 120; // 2 minutes
const OAUTH_ACCESS_TTL_SECONDS = 3600; // 1 hour
const OAUTH_REFRESH_TTL_SECONDS = 30 * 24 * 3600; // 30 days

function generateClientId(): string {
  return `authy_${crypto.randomBytes(16).toString("hex")}`;
}

function generateClientSecret(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

function hashCodeVerifier(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export class OAuthService {
  // ── App Management ─────────────────────────────────────────────────────────

  async createApp(
    organizationId: string,
    data: { name: string; redirectUris: string[]; scopes: string[] },
    adminId: string,
    meta: RequestMeta = {}
  ): Promise<{ app: Omit<OAuthApp, "clientSecretHash">; rawSecret: string }> {
    const org = await orgRepository.findById(organizationId);
    if (!org) throw new NotFoundError("Organization not found");

    const limits = PLAN_LIMITS[org.plan];
    const count = await oauthRepository.countByOrg(organizationId);
    if (count >= limits.maxOAuthApps) {
      throw new ValidationError(
        `Your plan allows a maximum of ${limits.maxOAuthApps} OAuth apps. Upgrade to create more.`
      );
    }

    const clientId = generateClientId();
    const { raw, hash } = generateClientSecret();

    const app = await oauthRepository.createApp({
      organizationId,
      name: data.name,
      clientId,
      clientSecretHash: hash,
      redirectUris: data.redirectUris,
      grantTypes: [OAuthGrantType.AUTHORIZATION_CODE, OAuthGrantType.REFRESH_TOKEN],
      scopes: data.scopes,
    });

    await auditService.log({
      userId: adminId,
      action: AuditAction.OAUTH_APP_CREATED,
      details: { organizationId, appId: app.id, name: app.name },
      ...meta,
    });

    const { clientSecretHash: _, ...safeApp } = app;
    return { app: safeApp, rawSecret: raw };
  }

  async listApps(organizationId: string): Promise<Omit<OAuthApp, "clientSecretHash">[]> {
    const apps = await oauthRepository.listApps(organizationId);
    return apps.map(({ clientSecretHash: _, ...a }) => a);
  }

  async getApp(id: string, organizationId: string): Promise<Omit<OAuthApp, "clientSecretHash">> {
    const app = await oauthRepository.findAppById(id);
    if (!app) throw new NotFoundError("OAuth app not found");
    if (app.organizationId !== organizationId) throw new AuthorizationError("App does not belong to this organization");
    const { clientSecretHash: _, ...safe } = app;
    return safe;
  }

  async updateApp(
    id: string,
    organizationId: string,
    data: { name?: string; redirectUris?: string[]; scopes?: string[] },
    adminId: string,
    meta: RequestMeta = {}
  ): Promise<Omit<OAuthApp, "clientSecretHash">> {
    const app = await oauthRepository.findAppById(id);
    if (!app) throw new NotFoundError("OAuth app not found");
    if (app.organizationId !== organizationId) throw new AuthorizationError("App does not belong to this organization");

    const updated = await oauthRepository.updateApp(id, data);

    await auditService.log({
      userId: adminId,
      action: AuditAction.OAUTH_APP_UPDATED,
      details: { appId: id, changes: data },
      ...meta,
    });

    const { clientSecretHash: _, ...safe } = updated;
    return safe;
  }

  async regenerateSecret(
    id: string,
    organizationId: string,
    adminId: string,
    meta: RequestMeta = {}
  ): Promise<{ rawSecret: string }> {
    const app = await oauthRepository.findAppById(id);
    if (!app) throw new NotFoundError("OAuth app not found");
    if (app.organizationId !== organizationId) throw new AuthorizationError("App does not belong to this organization");

    const { raw, hash } = generateClientSecret();
    await oauthRepository.updateApp(id, { clientSecretHash: hash });

    await auditService.log({
      userId: adminId,
      action: AuditAction.OAUTH_SECRET_REGENERATED,
      details: { appId: id },
      ...meta,
    });

    return { rawSecret: raw };
  }

  async deleteApp(
    id: string,
    organizationId: string,
    adminId: string,
    meta: RequestMeta = {}
  ): Promise<void> {
    const app = await oauthRepository.findAppById(id);
    if (!app) throw new NotFoundError("OAuth app not found");
    if (app.organizationId !== organizationId) throw new AuthorizationError("App does not belong to this organization");

    await oauthRepository.deleteApp(id);

    await auditService.log({
      userId: adminId,
      action: AuditAction.OAUTH_APP_DELETED,
      details: { appId: id, name: app.name },
      ...meta,
    });
  }

  // ── Authorization Code Flow (PKCE) ─────────────────────────────────────────

  async authorize(params: {
    clientId: string;
    redirectUri: string;
    responseType: string;
    scope: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    email: string;
    password: string;
  }): Promise<{ code: string; state: string; redirectUri: string }> {
    if (params.responseType !== "code") {
      throw new ValidationError("Only response_type=code is supported");
    }
    if (params.codeChallengeMethod !== "S256") {
      throw new ValidationError("Only code_challenge_method=S256 is supported");
    }

    const app = await oauthRepository.findAppByClientId(params.clientId);
    if (!app || !app.isActive) throw new AuthenticationError("Invalid client_id");

    if (!app.redirectUris.includes(params.redirectUri)) {
      throw new ValidationError("redirect_uri not registered for this client");
    }

    // Verify user credentials
    const user = await userRepository.findByEmail(params.email);
    if (!user || !user.isActive) throw new AuthenticationError("Invalid credentials");

    const passwordOk = await comparePassword(params.password, user.passwordHash);
    if (!passwordOk) throw new AuthenticationError("Invalid credentials");

    const scopes = params.scope.split(" ").filter(Boolean);
    const code = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);

    await oauthRepository.createAuthCode({
      oauthAppId: app.id,
      userId: user.id,
      code,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scopes,
      expiresAt,
    });

    // Track MAU
    cacheService.trackMau(app.organizationId, user.id).catch(() => undefined);

    return { code, state: params.state, redirectUri: params.redirectUri };
  }

  // ── Token Exchange ─────────────────────────────────────────────────────────

  async exchangeCode(params: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<{ accessToken: string; refreshToken: string; tokenType: string; expiresIn: number; scope: string }> {
    const app = await oauthRepository.findAppByClientId(params.clientId);
    if (!app || !app.isActive) throw new AuthenticationError("Invalid client_id");

    const secretHash = crypto.createHash("sha256").update(params.clientSecret).digest("hex");
    if (secretHash !== app.clientSecretHash) throw new AuthenticationError("Invalid client_secret");

    const authCode = await oauthRepository.findAuthCode(params.code);
    if (!authCode) throw new AuthenticationError("Invalid authorization code");
    if (authCode.isUsed) throw new AuthenticationError("Authorization code already used");
    if (authCode.expiresAt < new Date()) throw new AuthenticationError("Authorization code expired");
    if (authCode.oauthAppId !== app.id) throw new AuthenticationError("Code does not match client");
    if (authCode.redirectUri !== params.redirectUri) throw new AuthenticationError("redirect_uri mismatch");

    // Verify PKCE
    const expectedChallenge = hashCodeVerifier(params.codeVerifier);
    if (expectedChallenge !== authCode.codeChallenge) {
      throw new AuthenticationError("code_verifier does not match code_challenge");
    }

    await oauthRepository.markAuthCodeUsed(authCode.id);

    const user = await userRepository.findById(authCode.userId);
    if (!user) throw new AuthenticationError("User not found");

    const { privateKey, kid } = getOAuthKeyPair();

    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        orgId: app.organizationId,
        appId: app.id,
        scope: authCode.scopes.join(" "),
        type: "oauth_access",
      },
      privateKey,
      { algorithm: "RS256", expiresIn: OAUTH_ACCESS_TTL_SECONDS, keyid: kid, issuer: "authy" } as jwt.SignOptions
    );

    const refreshToken = jwt.sign(
      { sub: user.id, appId: app.id, type: "oauth_refresh", jti: crypto.randomUUID() },
      privateKey,
      { algorithm: "RS256", expiresIn: OAUTH_REFRESH_TTL_SECONDS, keyid: kid, issuer: "authy" } as jwt.SignOptions
    );

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: OAUTH_ACCESS_TTL_SECONDS,
      scope: authCode.scopes.join(" "),
    };
  }

  // ── Token Introspection (RFC 7662) ─────────────────────────────────────────

  async introspect(token: string): Promise<{ active: boolean; [key: string]: unknown }> {
    try {
      const { publicKey } = getOAuthKeyPair();
      const payload = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as jwt.JwtPayload;
      return {
        active: true,
        sub: payload["sub"],
        email: payload["email"],
        scope: payload["scope"],
        exp: payload["exp"],
        iat: payload["iat"],
        iss: payload["iss"],
      };
    } catch {
      return { active: false };
    }
  }
}

export const oauthService = new OAuthService();
