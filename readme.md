# Authy — Auth-as-a-Service Platform

> **Version:** 2.0.0 | **Node:** ≥ 20 | **TypeScript:** 5.9 | **PostgreSQL:** 16 | **Redis:** 7

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Database Schema](#5-database-schema)
6. [Environment Variables](#6-environment-variables)
7. [Multi-Tenancy & Organizations](#7-multi-tenancy--organizations)
8. [Plans & Quotas](#8-plans--quotas)
9. [Org API Keys](#9-org-api-keys)
10. [OAuth 2.0 + OIDC Authorization Server](#10-oauth-20--oidc-authorization-server)
11. [Permission Check API](#11-permission-check-api)
12. [Webhooks & Event System](#12-webhooks--event-system)
13. [API Reference](#13-api-reference)
14. [Authentication & Token Flows](#14-authentication--token-flows)
15. [ACL / Multi-App RBAC System](#15-acl--multi-app-rbac-system)
16. [Admin Notification System](#16-admin-notification-system)
17. [Security Features](#17-security-features)
18. [Message Queue](#18-message-queue)
19. [Caching Strategy](#19-caching-strategy)
20. [Audit & Access Logging](#20-audit--access-logging)
21. [Service-to-Service (S2S) API](#21-service-to-service-s2s-api)
22. [Error Handling](#22-error-handling)
23. [Rate Limiting](#23-rate-limiting)
24. [Setup & Running](#24-setup--running)
25. [Docker Deployment](#25-docker-deployment)

---

## 1. Overview

**Authy** is a production-grade, multi-tenant **Auth-as-a-Service** platform built with Node.js and TypeScript. It started as an internal IAM tool and has evolved into a full platform — comparable to Auth0, Clerk, or Firebase Auth — that organizations can use to manage authentication, authorization, and identity for their own end users and applications.

### What it does

| Capability | Description |
|---|---|
| User registration & login | Email + password with strength validation, account lockout, and history |
| Email verification | Time-limited tokens delivered via BullMQ email queue |
| Token management | JWT access + refresh pair, rotation on every refresh, logout-all |
| Forgot / reset password | Secure token flow with 1-hour expiry |
| Change password | Current password verification + history enforcement |
| Role-based access | USER, ADMIN, MODERATOR roles enforced at route level |
| Multi-app RBAC (ACL) | Apps, features, roles, and per-user overrides across registered services |
| Feature sync | Client apps submit feature manifests; admins approve or reject |
| Permission resolution | S2S token verify returns app-scoped permissions with stale detection |
| **Multi-tenancy** | Multiple organizations, each with own users, apps, and API keys |
| **Plans & quotas** | FREE / STARTER / PRO / ENTERPRISE tiers with enforced limits |
| **Org API Keys** | `sk_test_` / `sk_live_` scoped keys for external integrations |
| **OAuth 2.0 + OIDC** | Authorization Code + PKCE flow, RS256 JWTs, JWKs, OIDC discovery |
| **Permission check API** | Sub-millisecond `POST /check` backed by Redis-cached permissions |
| **Webhooks** | HMAC-SHA256 signed event delivery with BullMQ retry and delivery log |
| Admin management | List, edit, suspend, force-activate, delete users; view audit logs |
| Admin notifications | Subscription-based in-app notifications for ACL events |
| Audit logging | Every security event persisted to PostgreSQL |
| Caching | Redis-backed user cache, token blacklist, MAU tracking, perm cache |
| Async email | BullMQ job queue for all transactional email |
| Graceful shutdown | Closes HTTP, DB, Redis, and all queue workers cleanly |

---

## 2. Architecture

### Layered Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          HTTP Clients                            │
│        (Frontend, Mobile Apps, Third-party Integrations)         │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTPS
┌───────────────────────────────▼──────────────────────────────────┐
│                          Express App                             │
│   Helmet │ CORS │ Rate Limit │ Request ID │ Access Log           │
├──────────────────────────────────────────────────────────────────┤
│                            Routes                                │
│  /auth  /admin  /acl  /notifications  /internal  /health         │
│  /org  /org-api  /org/api-keys  /org/oauth-apps  /org/webhooks   │
│  /oauth  /.well-known  /check                                    │
├──────────────────────────────────────────────────────────────────┤
│                          Controllers                             │
│  auth │ admin │ acl │ notification │ internal │ org │ orgApiKey  │
│  oauth │ check │ webhook                                         │
├──────────────────────────────────────────────────────────────────┤
│                           Services                               │
│  AuthService │ OrgService │ OrgApiKeyService │ OAuthService       │
│  WebhookService │ AclService │ CacheService │ QueueService        │
│  AuditService │ NotificationService │ WebhookWorkerService        │
├──────────────────────────────────────────────────────────────────┤
│                         Repositories                             │
│  UserRepo │ OrgRepo │ OrgApiKeyRepo │ OAuthRepo │ WebhookRepo     │
│  AppRepo │ NotificationRepo │ AuditLogRepo │ TokenRepo            │
├────────────────┬─────────────────────────────┬───────────────────┤
│  PostgreSQL    │           Redis              │   BullMQ Queues   │
│  (Prisma ORM)  │  Permissions (60s TTL)       │  authy-email      │
│                │  MAU HyperLogLog (62d TTL)   │  authy-webhooks   │
│                │  API call counters (25h TTL) │  (3 retries,      │
│                │  Token blacklist             │   exp backoff)    │
│                │  User cache                  │                   │
└────────────────┴─────────────────────────────┴───────────────────┘
```

### Request Lifecycle

```
Request
  │
  ├─ Helmet (security headers)
  ├─ CORS (allowed: Authorization, X-Internal-API-Key, X-Authy-Key)
  ├─ express.json() (10 KB body limit)
  ├─ requestIdMiddleware (UUID, X-Request-ID header)
  ├─ accessLogMiddleware (logs on "finish")
  ├─ globalRateLimiter (100 req / 15 min / IP)
  │
  ├─ /api/v1/auth/*           → authRateLimiter → validate → controller
  ├─ /api/v1/admin/*          → authenticate → requireAdmin → controller
  ├─ /api/v1/org/*            → authenticate → requireOrgAdmin → controller
  ├─ /api/v1/org-api/*        → authenticateOrgSecret → controller
  ├─ /api/v1/org/api-keys/*   → authenticate → requireOrgAdmin → controller
  ├─ /api/v1/org/oauth-apps/* → authenticate → requireOrgAdmin → controller
  ├─ /api/v1/org/webhooks/*   → authenticate → requireOrgAdmin → controller
  ├─ /api/v1/check/*          → authenticateOrgApiKey → enforceQuota → controller
  ├─ /api/v1/oauth/*          → varies per endpoint
  ├─ /api/v1/internal/*       → X-Internal-API-Key header → controller
  └─ /.well-known/*           → public (JWKs, OIDC discovery)
```

---

## 3. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js ≥ 20 | JavaScript runtime |
| Language | TypeScript 5.9 (strict) | Type safety throughout |
| Framework | Express.js | HTTP server |
| ORM | Prisma 6 | PostgreSQL access with migrations |
| Cache / Queue | Redis 7 + node-redis | Sessions, blacklist, MAU, permissions |
| Job Queue | BullMQ | Email + webhook async delivery |
| Auth tokens | jsonwebtoken | HS256 (internal) + RS256 (OAuth) |
| Validation | Zod | Schema validation on all inputs |
| Logging | Winston | Structured JSON access + error logs |
| Password | bcrypt | Hashing with configurable cost factor |
| Security | helmet, cors, express-rate-limit | HTTP hardening |

---

## 4. Project Structure

```
authy/src/
├── config/
│   ├── database.ts            # Prisma client singleton
│   ├── env.ts                 # Zod-validated env schema
│   └── redis.ts               # Redis client singleton + helpers
│
├── constants/
│   ├── auth.constants.ts      # AuditAction enum, token expiries
│   ├── plans.constants.ts     # PLAN_LIMITS for each tier
│   └── protocol.constants.ts  # HTTP_STATUS, ERROR_CODES
│
├── controllers/
│   ├── auth.controller.ts
│   ├── admin.controller.ts
│   ├── acl.controller.ts
│   ├── check.controller.ts    # Permission check API
│   ├── notification.controller.ts
│   ├── oauth.controller.ts    # OAuth 2.0 + OIDC endpoints
│   ├── org.controller.ts      # Org admin + org API controllers
│   ├── org-api-key.controller.ts
│   └── webhook.controller.ts
│
├── middleware/
│   ├── auth.middleware.ts      # authenticate, requireAdmin, requireRole
│   ├── org-admin.middleware.ts # requireOrgAdmin (OWNER | ADMIN)
│   ├── org-api-key.middleware.ts # authenticateOrgApiKey (X-Authy-Key)
│   ├── quota.middleware.ts     # enforceApiCallQuota (plan limits)
│   └── validation.middleware.ts
│
├── repositories/
│   ├── user.repository.ts
│   ├── org.repository.ts
│   ├── org-api-key.repository.ts
│   ├── oauth.repository.ts
│   ├── webhook.repository.ts
│   ├── app.repository.ts
│   ├── audit-log.repository.ts
│   └── notification.repository.ts
│
├── routes/
│   ├── index.ts               # Route registration
│   ├── auth.routes.ts
│   ├── admin.routes.ts
│   ├── acl.routes.ts
│   ├── check.routes.ts
│   ├── notification.routes.ts
│   ├── oauth.routes.ts        # /oauth + /.well-known
│   ├── org.routes.ts          # /org + /org-api
│   ├── org-api-key.routes.ts
│   └── webhook.routes.ts
│
├── services/
│   ├── auth.service.ts
│   ├── acl.service.ts
│   ├── audit.service.ts
│   ├── cache.service.ts       # Permissions, MAU, API calls, user cache
│   ├── notification.service.ts
│   ├── oauth.service.ts
│   ├── org.service.ts
│   ├── org-api-key.service.ts
│   ├── queue.service.ts       # Email + webhook BullMQ queues
│   ├── webhook.service.ts
│   └── webhook-worker.service.ts # BullMQ webhook processor
│
└── utils/
    ├── errors.ts              # Custom error classes
    ├── jwt.utils.ts           # HS256 token generation/verification
    ├── oauth-keys.ts          # RSA keypair management
    ├── password.utils.ts
    ├── response.utils.ts      # ApiResponse envelope helpers
    ├── token.utils.ts
    └── validation.schemas.ts  # All Zod schemas
```

---

## 5. Database Schema

### Core Models

| Model | Purpose |
|---|---|
| `User` | End-users with auth fields, profile, and org membership |
| `RefreshToken` | Active refresh tokens (rotated on every use) |
| `EmailVerification` | Pending email verification tokens |
| `PasswordReset` | Pending password reset tokens |
| `PasswordHistory` | Last N hashes to prevent reuse |
| `AuditLog` | Immutable record of every security event |

### Organization Models

| Model | Purpose |
|---|---|
| `Organization` | Tenant with plan, auth mode, and secret |
| `OrganizationMember` | Admin/owner membership for dashboard access |
| `OrgInvitation` | Pending dashboard invitations with roles |

### SaaS Platform Models (new in v2)

| Model | Purpose |
|---|---|
| `OrgApiKey` | Named API keys (`sk_test_` / `sk_live_`) with scope + TTL |
| `OAuthApp` | OAuth 2.0 clients registered per org |
| `OAuthAuthCode` | Short-lived (120s) PKCE authorization codes |
| `OrgWebhook` | Registered webhook endpoints with per-webhook HMAC secret |
| `WebhookDelivery` | Delivery log per attempt (status, body, attempt count) |

### ACL Models

| Model | Purpose |
|---|---|
| `App` | Registered client application |
| `Feature` | Named permission key within an app |
| `AppRole` | Named role within an app |
| `RoleFeature` | Which features a role grants |
| `UserApp` | Which users are assigned to an app (and in what role) |
| `UserFeature` | Per-user feature overrides (grant / revoke) |
| `FeatureSyncRequest` | Feature manifests submitted by client apps |

### Enums

| Enum | Values |
|---|---|
| `OrgPlan` | `FREE`, `STARTER`, `PRO`, `ENTERPRISE` |
| `OrgMemberRole` | `OWNER`, `ADMIN`, `MEMBER` |
| `WebhookEventType` | `USER_CREATED`, `USER_LOGIN`, `USER_LOGIN_FAILED`, `USER_DELETED`, `USER_PASSWORD_CHANGED`, `ROLE_UPDATED`, `APP_CREATED`, `FEATURE_SYNCED` |
| `OAuthGrantType` | `AUTHORIZATION_CODE`, `REFRESH_TOKEN` |
| `AuthMode` | `FULL`, `DELEGATED`, `BOTH` |
| `OrgStatus` | `ACTIVE`, `SUSPENDED` |

---

## 6. Environment Variables

```env
# Server
NODE_ENV=development
PORT=3031
API_VERSION=v1

# PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/authy

# Redis
REDIS_URL=redis://localhost:6379

# JWT (HS256, internal tokens)
JWT_ACCESS_SECRET=<32+ char secret>
JWT_REFRESH_SECRET=<32+ char secret>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# OAuth 2.0 RSA keypair (RS256, OAuth tokens)
# If not set, an ephemeral keypair is generated on startup (tokens invalidated on restart)
OAUTH_PRIVATE_KEY=<PEM string>
OAUTH_PUBLIC_KEY=<PEM string>
OAUTH_KEY_ID=authy-oauth-key-1

# Admin
ADMIN_API_KEY=<secret for internal S2S calls>
INTERNAL_API_KEY=<secret for X-Internal-API-Key header>

# Email (BullMQ email worker)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=no-reply@example.com
SMTP_PASS=<smtp password>
EMAIL_FROM=Authy <no-reply@example.com>

# App
FRONTEND_URL=http://localhost:5175
```

### Generating RSA keys for OAuth

```bash
# Generate 2048-bit RSA private key
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem

# Set in .env (single-line PEM)
OAUTH_PRIVATE_KEY="$(awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' private.pem)"
OAUTH_PUBLIC_KEY="$(awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' public.pem)"
```

---

## 7. Multi-Tenancy & Organizations

Authy supports full multi-tenancy. Each **Organization** is an isolated tenant with its own:

- End users (registered via the Org API)
- API keys, OAuth apps, and webhooks
- Plan and usage limits
- Auth mode (`FULL`, `DELEGATED`, or `BOTH`)

### Auth Modes

| Mode | Behavior |
|---|---|
| `FULL` | Authy manages passwords — the org API accepts `email + password` |
| `DELEGATED` | The org validates credentials externally — Authy is told the user is authenticated |
| `BOTH` | Supports either mode per request |

### Organization Roles (Dashboard Access)

| Role | Description |
|---|---|
| `OWNER` | Full access including billing and delete |
| `ADMIN` | Can manage keys, apps, webhooks, and users |
| `MEMBER` | Read-only dashboard access |

---

## 8. Plans & Quotas

Every organization is on a plan that enforces hard limits. Exceeding a limit returns `429 PLAN_LIMIT_EXCEEDED`.

| Limit | FREE | STARTER | PRO | ENTERPRISE |
|---|---|---|---|---|
| MAU / month | 1,000 | 10,000 | 100,000 | Unlimited |
| API calls / day | 5,000 | 50,000 | 500,000 | Unlimited |
| Apps | 2 | 10 | 50 | Unlimited |
| Feature keys | 50 | 500 | 5,000 | Unlimited |
| API keys | 5 | 20 | 100 | Unlimited |
| OAuth apps | 2 | 10 | 50 | Unlimited |
| Webhooks | 3 | 10 | 50 | Unlimited |

### How limits are tracked

- **MAU** — Redis HyperLogLog (`authy:mau:{orgId}:{YYYY-MM}`), 62-day TTL
- **API calls** — Redis counter (`authy:apicalls:{orgId}:{YYYY-MM-DD}`), 25-hour TTL
- **Counts** (keys, apps, webhooks) — live database `COUNT(*)` at creation time

### Quota enforcement

The `enforceApiCallQuota` middleware sits in front of all `/check` endpoints. It reads the daily counter from Redis and returns 429 before the controller runs if the limit is reached.

```
GET /api/v1/org/usage   → { plan, limits, usage: { mauThisMonth, apiCallsToday, ... } }
```

---

## 9. Org API Keys

Organizations create named API keys to authenticate external systems (backends, CLIs, SDKs). Keys are **scoped** and can be **test** or **live** mode.

### Key format

```
sk_live_a3f8c91d...   (live mode — 32 hex bytes after prefix)
sk_test_b2e7d40c...   (test mode)
```

The full raw key is shown **only once** at creation. Only the SHA-256 hash and a 16-character prefix are stored.

### Scopes

| Scope | Grants access to |
|---|---|
| `check` | `POST /check` and `POST /check/batch` |
| `users:read` | Reading user data |
| `apps:read` | Reading app/feature configuration |
| `webhooks:write` | Triggering webhook-related actions |

### Authentication

Pass the key in the `X-Authy-Key` header:

```http
POST /api/v1/check
X-Authy-Key: sk_live_a3f8c91d...
Content-Type: application/json
```

### Endpoints

```
GET    /api/v1/org/api-keys          List all keys for the org
POST   /api/v1/org/api-keys          Create a key (returns rawKey once)
PATCH  /api/v1/org/api-keys/:id      Update name/scopes/expiry
DELETE /api/v1/org/api-keys/:id      Revoke a key
```

---

## 10. OAuth 2.0 + OIDC Authorization Server

Authy implements an **Authorization Code + PKCE** flow (RFC 7636). No implicit flow; no client credentials for end-user auth.

### Flow summary

```
1. Your app redirects user →  GET /api/v1/oauth/authorize
                               ?response_type=code
                               &client_id=<clientId>
                               &redirect_uri=<uri>
                               &code_challenge=<S256 hash>
                               &code_challenge_method=S256
                               &scope=openid profile email

2. Authy authenticates user and redirects → <redirect_uri>?code=<authCode>

3. Your backend exchanges code →  POST /api/v1/oauth/token
                                   code=<authCode>
                                   &code_verifier=<verifier>
                                   &grant_type=authorization_code
                                   &client_id=<clientId>
                                   &redirect_uri=<uri>

4. Response: { access_token, refresh_token, token_type, expires_in, scope }
```

### Token format

OAuth tokens are **RS256 JWTs** signed with the org's RSA keypair. The public key is published at `/.well-known/jwks.json` so consuming services can verify without calling Authy.

### Discovery

```
GET /.well-known/openid-configuration   OIDC discovery document
GET /.well-known/jwks.json              Public key set (JWK format)
```

### Endpoints

```
POST /api/v1/oauth/authorize            Authorize (returns redirect with code)
POST /api/v1/oauth/token                Exchange code for tokens
POST /api/v1/oauth/introspect           RFC 7662 token introspection
GET  /api/v1/org/oauth-apps             List OAuth apps
POST /api/v1/org/oauth-apps             Register new app (returns rawSecret once)
PATCH /api/v1/org/oauth-apps/:id        Update app
POST  /api/v1/org/oauth-apps/:id/regenerate-secret   Regenerate client secret
DELETE /api/v1/org/oauth-apps/:id       Delete app
```

### PKCE code challenge

Only `S256` is supported. The challenge is `BASE64URL(SHA256(code_verifier))` where `code_verifier` is a 43–128 character URL-safe random string.

```js
const verifier = crypto.randomBytes(32).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
```

---

## 11. Permission Check API

The check API lets any system instantly verify whether a user has access to a feature key, with **Redis-cached results (60-second TTL)**.

### Request

```http
POST /api/v1/check
X-Authy-Key: sk_live_...
Content-Type: application/json

{
  "token": "<user JWT>",
  "feature": "reports:export"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "allowed": true,
    "userId": "usr_abc123",
    "feature": "reports:export"
  }
}
```

### Batch check

```http
POST /api/v1/check/batch

{
  "token": "<JWT>",
  "features": ["reports:export", "users:invite", "billing:view"]
}
```

```json
{
  "data": {
    "results": {
      "reports:export": true,
      "users:invite": false,
      "billing:view": true
    }
  }
}
```

### Cache key

```
authy:perm:{userId}:{appId}:{roleVersion}
```

The `roleVersion` field ensures permissions are re-evaluated immediately whenever a role's feature set changes.

---

## 12. Webhooks & Event System

Organizations subscribe to events by registering webhook endpoints. When an event fires, Authy enqueues a signed delivery job via BullMQ.

### Supported events

| Event | Fired when |
|---|---|
| `USER_CREATED` | A user is registered via the Org API |
| `USER_LOGIN` | A user successfully logs in |
| `USER_LOGIN_FAILED` | A login attempt fails |
| `USER_DELETED` | A user is deleted |
| `USER_PASSWORD_CHANGED` | A user changes their password |
| `ROLE_UPDATED` | A role's feature set is modified |
| `APP_CREATED` | A new app is registered |
| `FEATURE_SYNCED` | A feature sync request is approved |

### Delivery

Each delivery POSTs JSON to your endpoint with three headers:

```
X-Authy-Event:       USER_CREATED
X-Authy-Signature:   <HMAC-SHA256 hex of request body, using webhook secret>
X-Authy-Delivery-Id: <UUID>
```

### Verifying signatures

```js
const crypto = require("crypto");

function verifySignature(body, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)          // raw request body string
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

### Retry policy

- **3 attempts** with exponential backoff starting at 10 seconds
- Any non-2xx response triggers a retry
- All attempts (success or failure) are logged to `WebhookDelivery`

### Endpoints

```
GET    /api/v1/org/webhooks                       List endpoints
POST   /api/v1/org/webhooks                       Register endpoint
PATCH  /api/v1/org/webhooks/:id                   Update URL / events / active
DELETE /api/v1/org/webhooks/:id                   Remove endpoint
GET    /api/v1/org/webhooks/:id/deliveries        Delivery log
POST   /api/v1/org/webhooks/:id/test              Send a test event
```

---

## 13. API Reference

All endpoints are prefixed with `/api/v1`. All responses follow the envelope:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

Errors:

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] },
  "meta": { "requestId": "..." }
}
```

### Auth routes (`/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register a new user |
| POST | `/auth/login` | — | Login, returns token pair |
| POST | `/auth/logout` | Bearer | Revoke current refresh token |
| POST | `/auth/logout-all` | Bearer | Revoke all sessions |
| POST | `/auth/refresh` | — | Rotate token pair |
| GET | `/auth/me` | Bearer | Get current user |
| PATCH | `/auth/me` | Bearer | Update profile |
| POST | `/auth/verify-email` | — | Verify email with token |
| POST | `/auth/resend-verification` | — | Resend verification email |
| POST | `/auth/forgot-password` | — | Send reset email |
| POST | `/auth/reset-password` | — | Reset password with token |
| POST | `/auth/change-password` | Bearer | Change password |

### Admin routes (`/admin`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/users` | Admin | List users (paginated, filterable) |
| GET | `/admin/users/:id` | Admin | Get user with audit history |
| PATCH | `/admin/users/:id` | Admin | Update user fields / role |
| PUT | `/admin/users/:id/suspend` | Admin | Suspend account |
| PUT | `/admin/users/:id/activate` | Admin | Activate account |
| PUT | `/admin/users/:id/force-activate` | Admin | Bypass email verification |
| DELETE | `/admin/users/:id` | Admin | Permanently delete user |
| GET | `/admin/audit-logs` | Admin | Query audit log |

### Admin org management (`/admin/organizations`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/organizations` | Admin | List all orgs |
| POST | `/admin/organizations` | Admin | Create org (returns secret once) |
| GET | `/admin/organizations/:id` | Admin | Get org + stats |
| PATCH | `/admin/organizations/:id` | Admin | Update org |
| PUT | `/admin/organizations/:id/suspend` | Admin | Suspend org |
| PUT | `/admin/organizations/:id/reactivate` | Admin | Reactivate org |
| POST | `/admin/organizations/:id/regenerate-secret` | Admin | New org secret |
| GET | `/admin/organizations/:id/members` | Admin | List members |
| POST | `/admin/organizations/:id/members` | Admin | Add member |
| DELETE | `/admin/organizations/:id/members/:userId` | Admin | Remove member |
| GET | `/admin/organizations/:id/apps` | Admin | List org apps |
| GET | `/admin/organizations/:id/users` | Admin | List org users |

### Org admin self-service (`/org`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/org/me` | OrgAdmin | Get own org |
| PATCH | `/org/me` | OrgAdmin | Update own org |
| GET | `/org/members` | OrgAdmin | List members |
| GET | `/org/apps` | OrgAdmin | List apps |
| GET | `/org/users` | OrgAdmin | List end users |
| GET | `/org/usage` | OrgAdmin | Plan + usage stats |
| GET/POST/PATCH/DELETE | `/org/api-keys/*` | OrgAdmin | API key CRUD |
| GET/POST/PATCH/DELETE | `/org/oauth-apps/*` | OrgAdmin | OAuth app CRUD |
| GET/POST/PATCH/DELETE | `/org/webhooks/*` | OrgAdmin | Webhook CRUD |

### Org API (`/org-api`)

Authenticated with the org **secret** via `Authorization: Bearer <orgSecret>`.

| Method | Path | Description |
|---|---|---|
| POST | `/org-api/register` | Register an end user into the org |
| POST | `/org-api/login` | Login an end user (returns user record) |

### Permission check (`/check`)

Authenticated with `X-Authy-Key`.

| Method | Path | Description |
|---|---|---|
| POST | `/check` | Check single feature for a user |
| POST | `/check/batch` | Check multiple features at once |

### OAuth (`/oauth` + `/.well-known`)

| Method | Path | Description |
|---|---|---|
| POST | `/oauth/authorize` | Start authorization code flow |
| POST | `/oauth/token` | Exchange code for tokens |
| POST | `/oauth/introspect` | Introspect a token (RFC 7662) |
| GET | `/.well-known/openid-configuration` | OIDC discovery |
| GET | `/.well-known/jwks.json` | Public JWK set |

### Internal S2S (`/internal`)

Authenticated with `X-Internal-API-Key`.

| Method | Path | Description |
|---|---|---|
| POST | `/internal/verify` | Verify token + return permissions |
| GET | `/internal/user/:id` | Get user by ID |

---

## 14. Authentication & Token Flows

### HS256 Tokens (internal, session-based)

Access tokens (15 min) and refresh tokens (7 days) are HS256 JWTs. The access token payload includes:

```json
{
  "userId": "...",
  "email": "...",
  "role": "USER",
  "orgId": "...",
  "orgRole": "ADMIN",
  "appPermissions": { "my-app": ["feature:read"] },
  "iat": 1716000000,
  "exp": 1716000900
}
```

### RS256 Tokens (OAuth 2.0)

OAuth access tokens are RS256 JWTs with a `kid` header matching the public JWK. Consuming services verify them locally using the JWKs endpoint — no round-trip to Authy required.

### Token rotation

Every `/auth/refresh` call issues a new access + refresh pair and immediately invalidates the old refresh token (stored hash in PostgreSQL). Using an already-consumed refresh token returns 401.

---

## 15. ACL / Multi-App RBAC System

Each registered **App** has its own set of:

- **Features** — atomic permission keys (e.g. `reports:export`)
- **Roles** — named sets of features (e.g. `Editor`, `Viewer`)
- **UserApp** — assigns a user to an app with a specific role
- **UserFeature** — per-user overrides (grant or revoke individual features)

### Permission resolution order

```
1. Get role features from UserApp.role → AppRole → RoleFeature
2. Apply UserFeature grants (add extras)
3. Apply UserFeature revokes (remove even if role grants them)
4. Cache result in Redis for 60 seconds
```

### Feature sync

Client apps can submit their feature manifest via `POST /acl/sync-requests`. Admins approve or reject in the dashboard. Approval upserts the submitted features without deleting existing ones.

---

## 16. Admin Notification System

Global admins subscribe to specific event types and optionally scope to a single app. When a matching event fires, Authy creates an in-app notification record and enqueues an email job.

Notification types include: `APP_REGISTERED`, `SYNC_REQUEST`, `ROLE_CHANGED`, `USER_SUSPENDED`, `FEATURE_UPDATED`.

---

## 17. Security Features

| Feature | Detail |
|---|---|
| Helmet | Sets 11 security headers including CSP, HSTS, X-Frame-Options |
| CORS | Allowlist-based; configurable per deployment |
| Rate limiting | Global (100/15min) + auth routes (5/15min) |
| Password strength | Minimum length, complexity, breached-password check |
| Password history | Configurable N-password reuse prevention |
| Account lockout | Auto-lock after N failures; timed release |
| Token blacklist | Revoked access tokens checked in Redis on every request |
| Refresh rotation | Each use consumes the token; replay returns 401 |
| API key hashing | SHA-256 stored; raw key never persisted |
| Webhook signing | HMAC-SHA256 per-webhook secret; `timingSafeEqual` for verification |
| PKCE enforcement | Only S256 accepted; code verifier validated server-side |
| Ephemeral RSA fallback | OAuth tokens still work without configured keys; warning logged |
| Audit trail | Every auth event written to `AuditLog` with IP, user-agent, request ID |

---

## 18. Message Queue

Two BullMQ queues share the same Redis connection:

### `authy-email`

Processes transactional emails: verification, password reset, password change, admin notifications.

### `authy-webhooks`

Delivers webhook payloads to registered endpoints.

- **3 retries** with exponential backoff starting at 10 seconds
- Uses native `fetch` with a 10-second `AbortController` timeout
- Every delivery attempt (success or failure) is written to `WebhookDelivery`
- Non-2xx responses count as failures and trigger retry

---

## 19. Caching Strategy

| Key pattern | TTL | Purpose |
|---|---|---|
| `authy:user:{userId}` | 5 min | Cached user object (busted on update) |
| `authy:blacklist:{jti}` | Access token TTL | Revoked token entries |
| `authy:revoked:{userId}` | — | Timestamp of last logout-all |
| `authy:perm:{userId}:{appId}:{roleVersion}` | 60 s | Resolved permission set |
| `authy:mau:{orgId}:{YYYY-MM}` | 62 days | HyperLogLog for MAU counting |
| `authy:apicalls:{orgId}:{YYYY-MM-DD}` | 25 hours | Daily API call counter |

---

## 20. Audit & Access Logging

### Audit log

Every significant event is written to `AuditLog` with:
- `userId` — who performed the action
- `action` — `AuditAction` enum value
- `details` — JSON payload (orgId, changes, etc.)
- `ipAddress`, `userAgent`, `requestId`

### Actions logged

User flows, admin actions, org management, API key lifecycle, OAuth app lifecycle, webhook management, org user registration/login.

### Access log

Every HTTP request is logged by Winston on the `finish` event:

```json
{
  "level": "info",
  "requestId": "abc-123",
  "method": "POST",
  "path": "/api/v1/auth/login",
  "status": 200,
  "duration": 42,
  "ip": "1.2.3.4"
}
```

---

## 21. Service-to-Service (S2S) API

Downstream microservices call `/api/v1/internal/*` with `X-Internal-API-Key: <key>` to verify tokens and resolve permissions without managing their own auth logic.

```http
POST /api/v1/internal/verify
X-Internal-API-Key: <key>
Content-Type: application/json

{ "token": "<user access token>", "appId": "<app slug>" }
```

Response:

```json
{
  "data": {
    "valid": true,
    "user": { ... },
    "permissions": ["reports:export", "users:invite"],
    "stale": false
  }
}
```

`stale: true` means the token's embedded `appPermissions` are outdated (role version changed). The caller should prompt a re-login or treat the permissions as the resolved set returned here.

---

## 22. Error Handling

All errors go through `errorMiddleware` which maps custom error classes to HTTP responses:

| Class | Status | Code |
|---|---|---|
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `AuthenticationError` | 401 | `AUTHENTICATION_ERROR` |
| `AuthorizationError` | 403 | `AUTHORIZATION_ERROR` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` |
| `TooManyRequestsError` | 429 | `TOO_MANY_REQUESTS` |
| Plan limit exceeded | 429 | `PLAN_LIMIT_EXCEEDED` |
| `DatabaseError` | 500 | `DATABASE_ERROR` |
| `AccountLockedError` | 423 | `ACCOUNT_LOCKED` |

---

## 23. Rate Limiting

| Limiter | Routes | Limit |
|---|---|---|
| Global | All routes | 100 requests / 15 min / IP |
| Auth | `/auth/login`, `/auth/register`, `/auth/forgot-password` | 5 requests / 15 min / IP |

Exceeds return `429` with a `Retry-After` header.

---

## 24. Setup & Running

### Prerequisites

- Node.js ≥ 20
- PostgreSQL 16
- Redis 7

### Local setup

```bash
cd authy
npm install

cp .env.example .env
# Edit .env with your database, Redis, and SMTP credentials

# Run migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Start dev server (ts-node + nodemon)
npm run dev
# → http://localhost:3031
```

### Scripts

| Script | Description |
|---|---|
| `npm run dev` | ts-node + nodemon with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/index.js` |
| `npm run lint` | ESLint check |
| `npx prisma studio` | Open Prisma Studio (DB browser) |
| `npx prisma migrate dev` | Create and apply a new migration |

---

## 25. Docker Deployment

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
COPY prisma/ ./prisma/
ENV NODE_ENV=production
EXPOSE 3031
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
services:
  authy:
    build: .
    ports: ["3031:3031"]
    environment:
      DATABASE_URL: postgresql://authy:pass@postgres:5432/authy
      REDIS_URL: redis://redis:6379
    depends_on: [postgres, redis]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: authy
      POSTGRES_USER: authy
      POSTGRES_PASSWORD: pass

  redis:
    image: redis:7-alpine
```
