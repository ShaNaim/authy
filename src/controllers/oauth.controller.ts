import { Request, Response, NextFunction } from "express";
import { env } from "@/config/env";
import { sendSuccess, sendCreated, sendNoContent, sendError } from "@/utils/response.utils";
import { oauthService } from "@/services/oauth.service";
import { getPublicJwk } from "@/utils/oauth-keys";
import { HTTP_STATUS, ERROR_CODES } from "@/constants";

function getMeta(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers["user-agent"], requestId: req.requestId };
}

const baseUrl = () => `${env.FRONTEND_URL.replace(/\/$/, "")}`;
const apiBase = () => `/api/${env.API_VERSION}`;

export const oauthController = {
  // ── OAuth App CRUD (org admin) ─────────────────────────────────────────────

  async createApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await oauthService.createApp(req.user!.orgId, req.body, req.user!.userId, getMeta(req));
      sendCreated(res, result, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async listApps(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apps = await oauthService.listApps(req.user!.orgId);
      sendSuccess(res, { apps }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async getApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const app = await oauthService.getApp(req.params["appId"]!, req.user!.orgId);
      sendSuccess(res, { app }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async updateApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const app = await oauthService.updateApp(req.params["appId"]!, req.user!.orgId, req.body, req.user!.userId, getMeta(req));
      sendSuccess(res, { app }, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async regenerateSecret(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await oauthService.regenerateSecret(req.params["appId"]!, req.user!.orgId, req.user!.userId, getMeta(req));
      sendSuccess(res, result, 200, req.requestId);
    } catch (err) {
      next(err);
    }
  },

  async deleteApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await oauthService.deleteApp(req.params["appId"]!, req.user!.orgId, req.user!.userId, getMeta(req));
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },

  // ── Authorization Endpoint ─────────────────────────────────────────────────

  async authorize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        client_id, redirect_uri, response_type, scope = "openid profile email",
        state = "", code_challenge, code_challenge_method = "S256",
        email, password,
      } = { ...req.query, ...req.body } as Record<string, string>;

      const result = await oauthService.authorize({
        clientId: client_id,
        redirectUri: redirect_uri,
        responseType: response_type,
        scope,
        state,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
        email,
        password,
      });

      const redirectUrl = new URL(result.redirectUri);
      redirectUrl.searchParams.set("code", result.code);
      if (result.state) redirectUrl.searchParams.set("state", result.state);

      res.redirect(302, redirectUrl.toString());
    } catch (err) {
      next(err);
    }
  },

  // ── Token Endpoint ─────────────────────────────────────────────────────────

  async token(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { grant_type, code, redirect_uri, code_verifier, client_id, client_secret } = req.body as Record<string, string>;

      if (grant_type !== "authorization_code") {
        sendError(res, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, "Unsupported grant_type", undefined, req.requestId);
        return;
      }

      const tokens = await oauthService.exchangeCode({
        clientId: client_id,
        clientSecret: client_secret,
        code,
        redirectUri: redirect_uri,
        codeVerifier: code_verifier,
      });

      res.status(200).json({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: tokens.tokenType,
        expires_in: tokens.expiresIn,
        scope: tokens.scope,
      });
    } catch (err) {
      next(err);
    }
  },

  // ── Token Introspection (RFC 7662) ─────────────────────────────────────────

  async introspect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.body as { token: string };
      if (!token) {
        sendError(res, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, "token is required", undefined, req.requestId);
        return;
      }
      const result = await oauthService.introspect(token);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // ── JWKs Endpoint ─────────────────────────────────────────────────────────

  jwks(_req: Request, res: Response): void {
    const jwk = getPublicJwk();
    res.status(200).json({ keys: [jwk] });
  },

  // ── OIDC Discovery ─────────────────────────────────────────────────────────

  discovery(_req: Request, res: Response): void {
    const base = baseUrl();
    const api = apiBase();

    res.status(200).json({
      issuer: "authy",
      authorization_endpoint: `${base}${api}/oauth/authorize`,
      token_endpoint: `${base}${api}/oauth/token`,
      introspection_endpoint: `${base}${api}/oauth/introspect`,
      jwks_uri: `${base}/.well-known/jwks.json`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
      scopes_supported: ["openid", "profile", "email"],
    });
  },
};
