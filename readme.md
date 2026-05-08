# Authy — Comprehensive Authentication & Authorization Microservice

> **Version:** 1.0.0 | **Node:** ≥ 20 | **TypeScript:** 5.9 | **PostgreSQL:** 16 | **Redis:** 7

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Database Schema](#5-database-schema)
6. [Environment Variables](#6-environment-variables)
7. [API Reference](#7-api-reference)
8. [Authentication & Token Flows](#8-authentication--token-flows)
9. [ACL / Multi-App RBAC System](#9-acl--multi-app-rbac-system)
10. [Admin Notification System](#10-admin-notification-system)
11. [Security Features](#11-security-features)
12. [Message Queue](#12-message-queue)
13. [Caching Strategy](#13-caching-strategy)
14. [Audit & Access Logging](#14-audit--access-logging)
15. [Service-to-Service (S2S) API](#15-service-to-service-s2s-api)
16. [Error Handling](#16-error-handling)
17. [Rate Limiting](#17-rate-limiting)
18. [Setup & Running](#18-setup--running)
19. [Docker Deployment](#19-docker-deployment)
20. [Testing](#20-testing)

---

## 1. Overview

**Authy** is a production-grade, self-contained authentication and authorization microservice built with Node.js and TypeScript. It serves as a central IAM (Identity and Access Management) platform — handling auth flows for users and enforcing fine-grained access control across multiple registered client applications.

### What it does

| Capability              | Description                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| User registration       | Email + password, with strength validation                               |
| Email verification      | Time-limited tokens delivered via email queue                            |
| Login / Logout          | JWT access + refresh token pair                                          |
| Token refresh           | Stateful refresh with rotation (every refresh issues a new pair)         |
| Logout all devices      | Invalidates every active session server-side                             |
| Forgot / Reset password | Secure token flow with 1-hour expiry                                     |
| Change password         | Verifies current password, enforces history                              |
| Password history        | Prevents reuse of the last N passwords                                   |
| Account lockout         | Auto-lock after N failed attempts with timed release                     |
| User profiles           | Self-editable personal fields; admin-only organisational fields          |
| Role-based access       | USER, ADMIN, MODERATOR roles enforced at route level                     |
| Multi-app RBAC (ACL)    | Apps, features, roles, and per-user overrides across registered services |
| Feature sync            | Client apps submit their feature manifest; admins approve or reject      |
| Permission resolution   | S2S token verify returns app-scoped permissions and stale detection      |
| Admin management        | List, edit, suspend, force-activate, delete users; view audit logs       |
| Admin notifications     | Subscription-based in-app + email notifications for ACL events           |
| Audit logging           | Every security event persisted to PostgreSQL                             |
| Access logging          | Every HTTP request/response logged via Winston                           |
| Caching                 | Redis-backed user cache + token blacklist                                |
| Async email             | BullMQ job queue processes emails without blocking the request           |
| S2S token verification  | Internal API for other microservices to validate JWTs                    |
| Graceful shutdown       | Closes HTTP, DB, Redis, and queue workers cleanly                        |

---

## 2. Architecture

### Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    HTTP Clients                         │
│          (Frontend, Mobile, Other Services)             │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────┐
│                   Express App                           │
│   Helmet │ CORS │ Rate Limit │ Request ID │ Access Log  │
├─────────────────────────────────────────────────────────┤
│                      Routes                             │
│   /api/v1/auth │ /api/v1/admin │ /api/v1/acl            │
│   /api/v1/notifications │ /api/v1/internal │ /health    │
├─────────────────────────────────────────────────────────┤
│                    Controllers                          │
│   auth │ admin │ acl │ notification │ internal │ health │
├─────────────────────────────────────────────────────────┤
│                     Services                            │
│   AuthService │ TokenService │ CacheService             │
│   AclService │ NotificationService                      │
│   AuditService │ QueueService │ EmailService            │
├─────────────────────────────────────────────────────────┤
│                     Repositories                        │
│   UserRepository │ TokenRepository │ AuditLogRepository │
│   AppRepository  │ NotificationRepository               │
├────────────┬────────────────────────────────────────────┤
│ PostgreSQL │         Redis             │   BullMQ Queue │
│ (Prisma)   │  (Cache + Blacklist)      │  (Email Jobs)  │
└────────────┴────────────────────────────────────────────┘
```

### Request Lifecycle

```
Request
  │
  ├─ Helmet (security headers)
  ├─ CORS
  ├─ express.json() (body parsing, 10 KB limit)
  ├─ requestIdMiddleware (attach UUID, set X-Request-ID header)
  ├─ accessLogMiddleware (log on "finish" event)
  ├─ globalRateLimiter (100 req / 15 min / IP)
  │
  ├─ Route: /api/v1/auth/*
  │    ├─ [authRateLimiter] (login/register/forgot: 5 req / 15 min)
  │    ├─ validate(schema) (Zod validation)
  │    ├─ [authenticate] (protected routes only)
  │    └─ Controller → Service → Repository → DB
  │
  ├─ Route: /api/v1/admin/*
  │    ├─ authenticate
  │    ├─ requireAdmin
  │    └─ Controller → Service → Repository → DB
  │
  ├─ Route: /api/v1/acl/*
  │    ├─ authenticate
  │    ├─ requireAdmin
  │    └─ AclController → AclService → AppRepository → DB
  │
  ├─ Route: /api/v1/notifications/*
  │    ├─ authenticate
  │    ├─ requireAdmin
  │    └─ NotificationController → NotificationService → DB
  │
  ├─ Route: /api/v1/internal/*
  │    ├─ internalApiKeyGuard (X-Internal-API-Key header)
  │    ├─ [appSecretGuard] (X-App-Secret header, some routes only)
  │    └─ Controller → Service
  │
  ├─ notFoundHandler (404 for unmatched routes)
  └─ errorHandler (global error handler)
```

---

## 3. Tech Stack

| Layer                | Technology         | Version      | Purpose                       |
| -------------------- | ------------------ | ------------ | ----------------------------- |
| Runtime              | Node.js            | ≥ 20         | Server runtime                |
| Language             | TypeScript         | 5.9 (strict) | Type safety                   |
| Framework            | Express            | 5.2          | HTTP server                   |
| ORM                  | Prisma             | 6.19         | Database access layer         |
| Database             | PostgreSQL         | 16           | Primary data store            |
| Cache / Queue Broker | Redis              | 7            | Caching + BullMQ backing      |
| Message Queue        | BullMQ             | latest       | Async job processing          |
| Email                | Nodemailer         | latest       | SMTP email delivery           |
| Auth                 | jsonwebtoken       | 9            | JWT generation & verification |
| Password Hashing     | bcrypt             | 6            | Secure password storage       |
| Validation           | Zod                | 4.2          | Runtime schema validation     |
| Logging              | Winston            | 3.19         | Structured logging            |
| Security Headers     | Helmet             | 8            | HTTP security headers         |
| CORS                 | cors               | 2.8          | Cross-origin resource sharing |
| Rate Limiting        | express-rate-limit | 8.2          | DDoS & brute-force protection |
| ID Generation        | uuid               | 13           | Request tracing IDs           |
| Container            | Docker + Compose   | -            | Deployment                    |
| Testing              | Jest + ts-jest     | -            | Unit + integration tests      |
| Test HTTP            | Supertest          | -            | API endpoint testing          |

---

## 4. Project Structure

```
authy/
├── prisma/
│   └── schema.prisma           # Database schema (14 models)
├── src/
│   ├── app.ts                  # Express app setup (middleware, routes)
│   ├── index.ts                # Bootstrap: DB/Redis connect, server start, graceful shutdown
│   │
│   ├── config/
│   │   ├── env.ts              # Zod-validated environment variables
│   │   ├── database.ts         # Prisma client singleton
│   │   ├── redis.ts            # Redis client singleton + helpers
│   │   └── index.ts
│   │
│   ├── constants/
│   │   ├── auth.constants.ts   # UserRole (re-export from Prisma), TokenType, AuditAction
│   │   ├── security.constants.ts # Lockout, expiry, rate limit defaults
│   │   ├── protocol.constants.ts # HTTP_STATUS, ERROR_CODES
│   │   └── index.ts
│   │
│   ├── types/
│   │   ├── auth.types.ts       # User, UserResponse, JWT payloads, AppPermission, request/response shapes
│   │   └── index.ts
│   │
│   ├── utils/
│   │   ├── base.logger.ts      # Winston logger with sanitization
│   │   ├── errors.ts           # Custom error hierarchy (AppError and subclasses)
│   │   ├── response.utils.ts   # Standardized ApiResponse<T> helpers
│   │   ├── password.utils.ts   # bcrypt hash/compare, strength validator
│   │   ├── jwt.utils.ts        # JWT generate/verify (access + refresh)
│   │   ├── token.utils.ts      # Secure random tokens, SHA-256 hash, expiry helpers
│   │   ├── validation.schemas.ts # Zod schemas for all request shapes
│   │   └── index.ts
│   │
│   ├── repositories/
│   │   ├── user.repository.ts         # User CRUD, lockout, password history
│   │   ├── token.repository.ts        # Refresh, email-verification, password-reset tokens
│   │   ├── audit-log.repository.ts    # Audit log CRUD with filtering
│   │   ├── app.repository.ts          # Apps, Features, Roles, UserApps, Sync Requests
│   │   ├── notification.repository.ts # Notifications and admin subscriptions
│   │   └── index.ts
│   │
│   ├── services/
│   │   ├── auth.service.ts       # Core business logic (register, login, logout, profile, etc.)
│   │   ├── acl.service.ts        # App RBAC: apps, features, roles, user access, permissions
│   │   ├── token.service.ts      # Token lifecycle (create, rotate, blacklist, revoke)
│   │   ├── cache.service.ts      # Redis cache: user data, token blacklist, revocation timestamps
│   │   ├── queue.service.ts      # BullMQ queue setup, job types, enqueue helper
│   │   ├── email.service.ts      # Nodemailer + HTML templates + queue worker processor
│   │   ├── notification.service.ts # Admin notification dispatch, subscriptions, inbox
│   │   ├── audit.service.ts      # Audit log writer (fire-and-forget, never crashes request)
│   │   └── index.ts
│   │
│   ├── middleware/
│   │   ├── request-id.middleware.ts   # UUID per request, X-Request-ID header
│   │   ├── access-log.middleware.ts   # HTTP access log on response finish
│   │   ├── auth.middleware.ts         # JWT Bearer auth + blacklist check + requireRole
│   │   ├── validation.middleware.ts   # Zod schema validation (body/query/params)
│   │   ├── rate-limit.middleware.ts   # Global, auth, resend-verification limiters
│   │   ├── error.middleware.ts        # notFoundHandler + global errorHandler
│   │   └── index.ts
│   │
│   ├── controllers/
│   │   ├── auth.controller.ts         # Public + protected auth endpoints
│   │   ├── admin.controller.ts        # Admin user management + audit logs
│   │   ├── acl.controller.ts          # App, feature, role, and user-app access management
│   │   ├── notification.controller.ts # Admin notification inbox + subscriptions
│   │   ├── internal.controller.ts     # S2S verify-token, get-user, sync-features, permissions
│   │   ├── health.controller.ts       # Liveness + readiness checks
│   │   └── index.ts
│   │
│   └── routes/
│       ├── auth.routes.ts
│       ├── admin.routes.ts
│       ├── acl.routes.ts
│       ├── notification.routes.ts
│       ├── internal.routes.ts
│       ├── health.routes.ts
│       └── index.ts
│
├── tests/
│   ├── unit/
│   │   ├── password.utils.test.ts
│   │   ├── jwt.utils.test.ts
│   │   ├── token.utils.test.ts
│   │   ├── validation.schemas.test.ts
│   │   └── errors.test.ts
│   ├── integration/
│   │   └── auth.test.ts
│   └── TESTS.md
│
├── logs/                        # Rotated Winston log files (gitignored)
├── .env.example
├── .env                         # Your environment (gitignored)
├── docker-compose.yml
├── Dockerfile
├── jest.config.ts
├── tsconfig.json
├── tsconfig.test.json
└── package.json
```

---

## 5. Database Schema

All models use `uuid()` as the primary key. The database is PostgreSQL 16 via Prisma ORM.

### Enums

| Enum                    | Values                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `UserRole`              | `USER`, `ADMIN`, `MODERATOR`                                                                      |
| `AppStatus`             | `PENDING`, `ACTIVE`, `SUSPENDED`                                                                  |
| `SyncRequestStatus`     | `PENDING`, `APPROVED`, `REJECTED`                                                                 |
| `NotificationEventType` | `APP_REGISTRATION`, `FEATURE_SYNC`, `USER_ACCESS_GRANTED`, `USER_ACCESS_REVOKED`, `ROLE_MODIFIED` |

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                  User                                   │
│ id │ email (UNIQUE) │ passwordHash │ role │ isVerified │ isActive       │
│ failedLoginAttempts │ lockedUntil │ lastLoginAt │ lastLoginIp           │
│ firstName │ lastName │ contact │ address │ dob │ nid (UNIQUE)          │
│ designation │ department │ position │ identifierNumber (UNIQUE)         │
│ createdAt │ updatedAt                                                   │
└───┬──────┬───────┬──────────┬──────────┬──────────┬────────────────────┘
    │      │       │          │          │          │
    ▼      ▼       ▼          ▼          ▼          ▼
┌────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐ ┌──────────────┐
│Refresh │ │Email    │ │Password  │ │Password  │ │Audit  │ │UserApp       │
│Token   │ │Verif.   │ │Reset     │ │History   │ │Log    │ │(join table)  │
└────────┘ └─────────┘ └──────────┘ └──────────┘ └───────┘ └──────┬───────┘
                                                                    │
                                                     ┌──────────────┼────────────────┐
                                                     ▼              ▼                ▼
┌───────────────────────────────────────────┐  ┌─────────┐  ┌──────────────┐  ┌──────────────┐
│                    App                    │  │AppRole  │  │UserFeature   │  │AdminNotif    │
│ id │ name (UNIQUE) │ displayName          │  │         │  │(direct ovr.) │  │Sub           │
│ description │ secretHash │ status         │  │ version │  └──────────────┘  └──────────────┘
│ allowedIps[] │ createdAt │ updatedAt      │  └────┬────┘
└───┬───────────────────────────────────────┘       │
    │                                               │
    ├──── Feature[] ──────── RoleFeature[] ─────────┘
    ├──── AppRole[]
    ├──── UserApp[]
    ├──── FeatureSyncRequest[]
    ├──── AdminNotificationSub[]
    └──── Notification[]
```

### Model Details

**User**
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `email` | string (unique) | Normalized to lowercase |
| `passwordHash` | string | bcrypt hash |
| `role` | enum | USER \| ADMIN \| MODERATOR |
| `isVerified` | boolean | Email verified? |
| `isActive` | boolean | Account active? (`false` = soft ban or unverified) |
| `failedLoginAttempts` | int | Resets on success or lockout |
| `lockedUntil` | DateTime? | Null when not locked |
| `lastLoginAt` | DateTime? | Updated on login |
| `lastLoginIp` | string? | Client IP on last login |
| `firstName`, `lastName` | string? | User-editable profile |
| `contact` | string? | Phone / contact info |
| `address` | string? | Physical address |
| `dob` | DateTime? | Date of birth |
| `nid` | string? (unique) | National ID — must be 20 digits |
| `designation` | string? | Job title — admin-only |
| `department` | string? | Department — admin-only |
| `position` | string? | Position/level — admin-only |
| `identifierNumber` | string? (unique) | Employee/student ID — admin-only |

**RefreshToken** — Stored as SHA-256 hash, not plaintext
| Field | Type | Description |
|---|---|---|
| `tokenHash` | string (unique) | SHA-256(rawJWT) |
| `isRevoked` | boolean | Invalidated on logout or rotation |
| `expiresAt` | DateTime | Server-side expiry (7 days) |

**EmailVerification / PasswordReset**

- Token stored as SHA-256 hash
- `isUsed = true` after consumption (single-use)
- Previous tokens for same user are invalidated on new request

**AuditLog**

- `userId` is nullable (pre-auth actions have no user)
- `details` is `Json?` (Prisma JSON field)
- `requestId` ties log entry to the request UUID

**PasswordHistory**

- Last N hashes stored (N = `PASSWORD_HISTORY_LIMIT`, default 5)
- Oldest entries pruned automatically on each password change

**App**
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | string (unique) | Slug (lowercase, hyphens) — used in API calls |
| `displayName` | string | Human-readable name |
| `description` | string? | Optional description |
| `secretHash` | string | SHA-256 of the app secret (never returned) |
| `status` | enum | ACTIVE \| PENDING \| SUSPENDED |
| `allowedIps` | string[] | Optional IP allowlist |

**Feature** — Scoped to an App
| Field | Notes |
|---|---|
| `appId` | FK to App |
| `key` | Unique within the app (`appId + key` unique constraint) |
| `displayName` | Human label |

**FeatureSyncRequest** — Created when a client app submits its feature manifest
| Field | Notes |
|---|---|
| `appId` | FK to App |
| `features` | JSON array of `{ key, displayName, description? }` |
| `status` | PENDING → APPROVED or REJECTED |
| `reviewedBy` | FK to User (admin who acted) |
| `reviewedAt` | DateTime of review |

**AppRole** — A named permission bundle within an app
| Field | Notes |
|---|---|
| `appId` | FK to App |
| `name` | Unique within app |
| `isDefault` | Assigned automatically to new users of this app |
| `version` | Int, incremented on every update or feature set change |

**RoleFeature** — Join table between AppRole and Feature (composite PK)

**UserApp** — A user's membership in an app
| Field | Notes |
|---|---|
| `userId`, `appId` | Unique pair |
| `roleId` | Optional FK to AppRole |
| `isActive` | Access enabled? |
| `grantedBy` | FK to User (admin who assigned) |

**UserFeature** — Per-user feature overrides (on top of role)
| Field | Notes |
|---|---|
| `userAppId` | FK to UserApp |
| `featureId` | FK to Feature |
| `granted` | `true` = explicitly granted, `false` = explicitly revoked |

**AdminNotificationSub** — An admin's subscription to an event type
| Field | Notes |
|---|---|
| `adminId` | FK to User |
| `eventType` | One of `NotificationEventType` enum values |
| `scope` | `"GLOBAL"` = all apps; any other value = specific appId |
| `appId` | FK to App (nullable, set when scope is app-specific) |

**Notification** — An admin's inbox item
| Field | Notes |
|---|---|
| `adminId` | FK to User |
| `eventType` | Event that triggered this |
| `appId` | FK to App (nullable) |
| `title`, `body` | Display content |
| `isRead` | Boolean, default false |
| `metadata` | JSON (e.g., `{ requestId, featureCount }`) |

---

## 6. Environment Variables

Copy `.env.example` to `.env` and fill in your values.

| Variable                       | Required | Default                 | Description                             |
| ------------------------------ | -------- | ----------------------- | --------------------------------------- |
| `NODE_ENV`                     | ✓        | `development`           | `development` \| `production` \| `test` |
| `PORT`                         | ✓        | `3031`                  | HTTP server port                        |
| `API_VERSION`                  | ✓        | `v1`                    | API prefix (`/api/v1`)                  |
| `DATABASE_URL`                 | ✓        | —                       | PostgreSQL connection string            |
| `REDIS_HOST`                   | ✓        | —                       | Redis host                              |
| `REDIS_PORT`                   | ✓        | `6379`                  | Redis port                              |
| `REDIS_PASSWORD`               | —        | `""`                    | Redis password (blank if none)          |
| `JWT_ACCESS_SECRET`            | ✓        | —                       | ≥ 32 chars. Signs access tokens         |
| `JWT_REFRESH_SECRET`           | ✓        | —                       | ≥ 32 chars. Signs refresh tokens        |
| `ACCESS_TOKEN_EXPIRY`          | ✓        | `15m`                   | JWT access token lifetime               |
| `REFRESH_TOKEN_EXPIRY`         | ✓        | `7d`                    | JWT refresh token lifetime              |
| `SMTP_HOST`                    | —        | —                       | SMTP server host                        |
| `SMTP_PORT`                    | —        | `587`                   | SMTP port (465 = SSL, 587 = TLS)        |
| `SMTP_USER`                    | —        | —                       | SMTP username                           |
| `SMTP_PASS`                    | —        | —                       | SMTP password / app password            |
| `EMAIL_FROM`                   | —        | —                       | Sender address                          |
| `FRONTEND_URL`                 | ✓        | `http://localhost:3000` | Used in email links                     |
| `MAX_LOGIN_ATTEMPTS`           | ✓        | `5`                     | Failed attempts before lockout          |
| `LOCKOUT_DURATION_MINUTES`     | ✓        | `15`                    | Minutes account stays locked            |
| `BCRYPT_ROUNDS`                | ✓        | `12`                    | bcrypt cost factor (10–14 for prod)     |
| `RATE_LIMIT_WINDOW_MS`         | ✓        | `900000`                | Rate limit window (15 min)              |
| `RATE_LIMIT_MAX_REQUESTS`      | ✓        | `100`                   | Global max requests per window          |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | ✓        | `5`                     | Auth-route max requests per window      |
| `INTERNAL_API_KEY`             | —        | —                       | ≥ 32 chars. S2S API key                 |
| `PASSWORD_HISTORY_LIMIT`       | ✓        | `5`                     | How many past passwords to reject       |

> **Security tip:** Generate secrets with `openssl rand -hex 32`

---

## 7. API Reference

All responses follow the `ApiResponse<T>` envelope:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-05-02T12:00:00.000Z"
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_ERROR",
    "message": "Invalid email or password",
    "details": null
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

### 7.1 Public Auth Endpoints

Base path: `/api/v1/auth`

---

#### `POST /register`

Register a new user. A verification email is sent asynchronously.

**Rate limit:** 5 requests / 15 min / IP

**Request body:**

```json
{ "email": "user@example.com", "password": "Secure#Pass1" }
```

**Password rules:** ≥ 8 chars, ≤ 128 chars, uppercase, lowercase, digit, special char (`@$!%*?&`)

**Response `201`:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "role": "USER",
      "isVerified": false,
      "isActive": false,
      "lastLoginAt": null,
      "createdAt": "2026-05-02T12:00:00.000Z"
    },
    "message": "Account created. Please check your email to verify your account."
  }
}
```

**Errors:** `400` validation failure | `409` email already registered

---

#### `POST /login`

**Rate limit:** 5 requests / 15 min / IP

**Request body:**

```json
{ "email": "user@example.com", "password": "Secure#Pass1" }
```

**Response `200`:**

```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "...", "role": "USER", "isVerified": true, ... },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ..."
    }
  }
}
```

**Errors:**

- `401` — Invalid credentials (generic, does not reveal which field is wrong)
- `403` — Email not verified
- `429` — Account locked (includes minutes remaining in the message)
- `429` — Rate limit exceeded

---

#### `POST /refresh`

Exchange a refresh token for a new access + refresh token pair. The old refresh token is revoked immediately (token rotation).

**Request body:**

```json
{ "refreshToken": "eyJ..." }
```

**Response `200`:**

```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ..."
    }
  }
}
```

**Errors:** `401` invalid/expired/revoked refresh token

---

#### `GET /verify-email?token=<hex>`

Verify an email address using the token from the verification email. The `token` query parameter is the raw hex string (64 chars).

**Response `200`:**

```json
{ "success": true, "data": { "message": "Email verified successfully" } }
```

**Side effect:** Welcome email queued.

**Errors:** `401` invalid/expired/used token

---

#### `POST /resend-verification`

**Rate limit:** 3 requests / 1 hour / IP

**Request body:**

```json
{ "email": "user@example.com" }
```

**Response `200`:** Always returns success (does not reveal whether account exists)

```json
{ "success": true, "data": { "message": "If an account with that email exists, a verification email will be sent." } }
```

---

#### `POST /forgot-password`

**Rate limit:** 5 requests / 15 min / IP

**Request body:**

```json
{ "email": "user@example.com" }
```

**Response `200`:** Always returns success (enumeration-safe)

```json
{ "success": true, "data": { "message": "If an account with that email exists, a password reset link will be sent." } }
```

---

#### `POST /reset-password`

Reset password using the token from the password-reset email (1-hour expiry).

**Request body:**

```json
{ "token": "<64-char-hex>", "newPassword": "NewSecure#Pass2" }
```

**Response `200`:**

```json
{ "success": true, "data": { "message": "Password reset successfully. Please log in with your new password." } }
```

**Side effects:** All active sessions revoked. Password-changed notification email sent.

**Errors:** `401` invalid/expired token | `400` password too weak | `400` password recently used

---

### 7.2 Protected Endpoints (require `Authorization: Bearer <accessToken>`)

---

#### `GET /me`

**Response `200`:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "...",
      "role": "USER",
      "isVerified": true,
      "firstName": "Jane",
      "lastName": "Doe",
      "contact": "+1 555 000 0000",
      "address": "123 Main St",
      "dob": "1990-01-15T00:00:00.000Z",
      "nid": "12345678901234567890",
      "designation": "Senior Engineer",
      "department": "Engineering",
      "position": "Team Lead",
      "identifierNumber": "EMP-0042"
    }
  }
}
```

Result is cached in Redis for 5 minutes.

---

#### `PATCH /me`

Update the authenticated user's own profile fields.

**Request body** (all fields optional):

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "contact": "+1 555 000 0000",
  "address": "123 Main St",
  "dob": "1990-01-15",
  "nid": "12345678901234567890"
}
```

**Validation:** `nid` must be exactly 20 digits if provided. All strings are trimmed.

**Response `200`:** Updated user object.

**Note:** Org fields (`designation`, `department`, `position`, `identifierNumber`) cannot be set by users — only admins can update those.

---

#### `POST /logout`

Revokes the current refresh token and blacklists the access token JTI.

**Request body:**

```json
{ "refreshToken": "eyJ..." }
```

**Response `200`:**

```json
{ "success": true, "data": { "message": "Logged out successfully" } }
```

---

#### `POST /logout-all`

Revokes ALL active sessions for the user (all refresh tokens + per-user revocation timestamp).

**Response `200`:**

```json
{ "success": true, "data": { "message": "Logged out from all devices" } }
```

---

#### `PUT /change-password`

**Request body:**

```json
{
  "currentPassword": "OldSecure#Pass1",
  "newPassword": "NewSecure#Pass2"
}
```

**Response `200`:**

```json
{ "success": true, "data": { "message": "Password changed successfully. Please log in again." } }
```

**Side effects:** All active sessions revoked. Password-changed notification email sent.

**Errors:** `401` wrong current password | `400` new password too weak | `400` password recently used

---

### 7.3 Admin Endpoints

Base path: `/api/v1/admin`  
**Requires:** `Authorization: Bearer <adminAccessToken>` (role = ADMIN)

---

#### `GET /users`

List all users with pagination and optional filters.

**Query params:**

| Param        | Type    | Description                               |
| ------------ | ------- | ----------------------------------------- |
| `page`       | int     | Default `1`                               |
| `limit`      | int     | Default `20`, max `100`                   |
| `role`       | string  | Filter by `USER`, `ADMIN`, or `MODERATOR` |
| `isActive`   | boolean | Filter by active status                   |
| `isVerified` | boolean | Filter by verification status             |
| `search`     | string  | Search by name or email (partial match)   |

**Response `200`:**

```json
{
  "success": true,
  "data": {
    "items": [ { user }, { user }, ... ],
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

---

#### `GET /users/:id`

Get a single user by UUID, including all profile and org fields.

**Response `200`:** `{ "data": { "user": { ... } } }`  
**Errors:** `404` not found

---

#### `PATCH /users/:id`

Update a user's role and/or organisational fields.

**Request body** (all fields optional):

```json
{
  "role": "MODERATOR",
  "designation": "Senior Engineer",
  "department": "Engineering",
  "position": "Team Lead",
  "identifierNumber": "EMP-0042"
}
```

**Response `200`:** Updated user object.

**Note:** Profile fields (`firstName`, `lastName`, etc.) are user-managed via `PATCH /me`. Admins use this endpoint only for role and org-level fields.

---

#### `PUT /users/:id/suspend`

Deactivate a user account (`isActive = false`). Revokes all active sessions.

**Response `200`:** Updated user object  
**Errors:** `400` cannot suspend own account | `404` not found

---

#### `PUT /users/:id/activate`

Re-activate a suspended (but already verified) account.

**Response `200`:** Updated user object

---

#### `PUT /users/:id/force-activate`

Bypass email verification for a user who has not yet verified their email. The admin must provide their own password as confirmation.

**Request body:**

```json
{ "adminPassword": "Admin#Pass1" }
```

**Response `200`:** Updated user object (now `isVerified = true`, `isActive = true`).

**Errors:** `401` wrong admin password | `400` user is already verified

---

#### `DELETE /users/:id`

Permanently delete a user and all related records (cascade). The deleted user's email is captured in the audit log.

**Response `204` No Content**  
**Errors:** `400` cannot delete own account

---

#### `GET /audit-logs`

View all audit log entries with filtering.

**Query params:** `page`, `limit`, `action` (e.g., `LOGIN_FAILED`), `userId`, `from` (ISO date), `to` (ISO date)

**Response `200`:** Paginated list of audit log entries

---

#### `GET /users/:id/audit-logs`

View audit logs for a specific user.

**Response `200`:** Paginated list

---

### 7.4 ACL / RBAC Endpoints

Base path: `/api/v1/acl`  
**Requires:** `Authorization: Bearer <adminAccessToken>` (role = ADMIN)

---

#### Apps

| Method  | Path                             | Description                                                |
| ------- | -------------------------------- | ---------------------------------------------------------- |
| `GET`   | `/apps`                          | List all registered apps (paginated, filterable by status) |
| `POST`  | `/apps`                          | Register a new app — returns secret **once**               |
| `GET`   | `/apps/:appId`                   | Get app details                                            |
| `PATCH` | `/apps/:appId`                   | Update display name, description, or allowed IPs           |
| `PUT`   | `/apps/:appId/suspend`           | Suspend an app                                             |
| `PUT`   | `/apps/:appId/reactivate`        | Re-activate a suspended app                                |
| `POST`  | `/apps/:appId/regenerate-secret` | Rotate the app secret — new secret returned once           |

**Register app — Request body:**

```json
{
  "name": "finance-app",
  "displayName": "Finance Portal",
  "description": "Internal finance management system",
  "allowedIps": ["10.0.0.0/8"]
}
```

**Register app — Response `201`:**

```json
{
  "success": true,
  "data": {
    "app": { "id": "...", "name": "finance-app", "displayName": "Finance Portal", "status": "ACTIVE", ... },
    "secret": "<raw-64-char-hex>"
  }
}
```

> The `secret` is shown exactly once. Store it in the client service's environment variables. Authy only stores its SHA-256 hash.

---

#### Features (Admin-Direct)

| Method   | Path                    | Description                                |
| -------- | ----------------------- | ------------------------------------------ |
| `GET`    | `/apps/:appId/features` | List all features for an app               |
| `POST`   | `/apps/:appId/features` | Add a feature to an app                    |
| `PATCH`  | `/features/:featureId`  | Update feature display name or description |
| `DELETE` | `/features/:featureId`  | Remove a feature                           |

**Add feature — Request body:**

```json
{ "key": "approve_transaction", "displayName": "Approve Transaction", "description": "Can approve pending transactions" }
```

`key` must be unique within the app and match `/^[a-z0-9_]+$/`.

---

#### Feature Sync Requests

Client apps self-register their features by calling the internal API (see §7.6). Admins then review the queue here.

| Method | Path                                | Description                                        |
| ------ | ----------------------------------- | -------------------------------------------------- |
| `GET`  | `/sync-requests`                    | List all sync requests (filterable by app, status) |
| `PUT`  | `/sync-requests/:requestId/approve` | Approve — upserts all submitted features           |
| `PUT`  | `/sync-requests/:requestId/reject`  | Reject the request                                 |

---

#### Roles

| Method   | Path                      | Description                               |
| -------- | ------------------------- | ----------------------------------------- |
| `GET`    | `/apps/:appId/roles`      | List roles for an app                     |
| `POST`   | `/apps/:appId/roles`      | Create a role                             |
| `PATCH`  | `/roles/:roleId`          | Update role name/description/default flag |
| `DELETE` | `/roles/:roleId`          | Delete a role                             |
| `PUT`    | `/roles/:roleId/features` | Replace the feature set for a role        |

**Create role — Request body:**

```json
{ "name": "manager", "displayName": "Manager", "description": "Can approve and export", "isDefault": false }
```

**Set role features — Request body:**

```json
{ "featureIds": ["uuid-1", "uuid-2"] }
```

> Updating a role (metadata or feature set) bumps its `version` and immediately invalidates all sessions of users assigned to that role.

---

#### User-App Access

| Method   | Path                                  | Description                                   |
| -------- | ------------------------------------- | --------------------------------------------- |
| `GET`    | `/apps/:appId/users`                  | List users assigned to an app                 |
| `POST`   | `/apps/:appId/users`                  | Assign a user to an app with an optional role |
| `PATCH`  | `/apps/:appId/users/:userId`          | Change a user's role or active status         |
| `DELETE` | `/apps/:appId/users/:userId`          | Remove a user from an app                     |
| `PUT`    | `/apps/:appId/users/:userId/features` | Set per-user feature overrides                |

**Assign user — Request body:**

```json
{ "userId": "uuid", "roleId": "uuid-optional" }
```

**Set per-user feature overrides — Request body:**

```json
{
  "overrides": [
    { "featureId": "uuid-1", "granted": true },
    { "featureId": "uuid-2", "granted": false }
  ]
}
```

> Any change to a user's app access (role change, active toggle, feature overrides) immediately invalidates their sessions so they pick up new permissions on next login.

---

### 7.5 Notification Endpoints

Base path: `/api/v1/notifications`  
**Requires:** `Authorization: Bearer <adminAccessToken>` (role = ADMIN)

---

#### Inbox

| Method | Path             | Description                                               |
| ------ | ---------------- | --------------------------------------------------------- |
| `GET`  | `/`              | List notifications (paginated; `?unreadOnly=true` filter) |
| `GET`  | `/unread-count`  | Get count of unread notifications                         |
| `PUT`  | `/:id/read`      | Mark a single notification as read                        |
| `PUT`  | `/mark-all-read` | Mark all notifications as read                            |

---

#### Subscriptions

| Method   | Path                  | Description                                   |
| -------- | --------------------- | --------------------------------------------- |
| `GET`    | `/subscriptions`      | List current admin's subscriptions            |
| `POST`   | `/subscriptions`      | Subscribe to an event type                    |
| `POST`   | `/subscriptions/bulk` | Subscribe multiple admins to an event at once |
| `DELETE` | `/subscriptions/:id`  | Unsubscribe                                   |

**Create subscription — Request body:**

```json
{
  "eventType": "FEATURE_SYNC",
  "appId": "uuid-optional"
}
```

If `appId` is omitted, scope is `GLOBAL` (all apps).

**Bulk create — Request body:**

```json
{
  "adminIds": ["uuid-1", "uuid-2"],
  "eventType": "APP_REGISTRATION"
}
```

---

#### Direct Send

| Method | Path    | Description                                    |
| ------ | ------- | ---------------------------------------------- |
| `POST` | `/send` | Send a one-off notification to specific admins |

**Request body:**

```json
{
  "adminIds": ["uuid-1", "uuid-2"],
  "title": "Action required",
  "body": "Please review the pending sync requests."
}
```

---

### 7.6 Internal / S2S Endpoints

Base path: `/api/v1/internal`  
**Auth (all routes):** `X-Internal-API-Key: <INTERNAL_API_KEY>` header  
**App-secret routes:** additionally require `X-App-Secret: <raw-app-secret>` header

These endpoints are meant for other microservices in your infrastructure, **never exposed to clients**.

---

#### `POST /verify-token`

Verify an access token and return the associated user. Checks the token blacklist and per-user revocation timestamp.

**Request body:**

```json
{ "token": "eyJ..." }
```

**Basic response `200`:**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "user": { "id": "uuid", "email": "...", "role": "USER", ... }
  }
}
```

If the token is invalid/expired/revoked: `{ "valid": false, "user": null }`

**With `X-App-Secret` header (permission-aware response):**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "user": { ... },
    "appPermission": {
      "roleId": "uuid",
      "roleName": "manager",
      "roleVersion": 3,
      "features": ["approve_transaction", "view_transactions"]
    },
    "permissionsStale": false
  }
}
```

`permissionsStale: true` means the user's JWT was issued against an older role version — the service should prompt the client to re-login for fresh permissions.

---

#### `GET /users/:id`

Fetch a user by ID for other services that need user details.

**Response `200`:** `{ "data": { "user": { ... } } }`  
**Errors:** `404`

---

#### `POST /sync-features` _(requires `X-App-Secret`)_

A client app self-registers its feature manifest. Creates a `FeatureSyncRequest` with status `PENDING`. Triggers a `FEATURE_SYNC` notification to subscribed admins.

**Request body:**

```json
{
  "features": [
    { "key": "view_transactions", "displayName": "View Transactions" },
    { "key": "approve_transaction", "displayName": "Approve Transaction", "description": "..." }
  ]
}
```

**Response `201`:**

```json
{
  "success": true,
  "data": {
    "message": "Feature sync submitted for admin review",
    "requestId": "uuid",
    "appId": "uuid",
    "featureCount": 2
  }
}
```

---

#### `GET /users/:userId/permissions` _(requires `X-App-Secret`)_

Resolve a user's full permission set for the calling app.

**Response `200`:**

```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "appId": "uuid",
    "hasAccess": true,
    "permission": {
      "roleId": "uuid",
      "roleName": "manager",
      "roleVersion": 3,
      "features": ["view_transactions", "approve_transaction"]
    }
  }
}
```

---

### 7.7 Health Endpoints

Base path: `/health`  
**No authentication required.**

---

#### `GET /health`

Liveness probe. Returns immediately.

**Response `200`:**

```json
{ "status": "ok", "service": "auth-service", "timestamp": "..." }
```

---

#### `GET /health/ready`

Readiness probe. Checks PostgreSQL and Redis connectivity.

**Response `200` (ready):**

```json
{
  "status": "ready",
  "checks": { "database": "ok", "redis": "ok" },
  "timestamp": "..."
}
```

**Response `503` (degraded):**

```json
{
  "status": "degraded",
  "checks": { "database": "error", "redis": "ok" },
  "timestamp": "..."
}
```

---

## 8. Authentication & Token Flows

### 8.1 Registration Flow

```
Client                              Authy                      Email Queue
  │                                   │                              │
  │── POST /register ────────────────▶│                              │
  │                                   │ validate email + password    │
  │                                   │ hash password (bcrypt)       │
  │                                   │ create User in DB            │
  │                                   │ save password to history     │
  │                                   │ generate verification token  │
  │                                   │ hash token, store in DB      │
  │                                   │── enqueueEmail(VERIFY) ─────▶│
  │◀── 201 { user, message } ─────────│                              │
  │                                   │                              │── SMTP send ──▶ User inbox
```

### 8.2 Email Verification Flow

```
User inbox (email link):  GET /api/v1/auth/verify-email?token=<hex>

Client                       Authy
  │                            │
  │── GET /verify-email?token=▶│
  │                            │ hash token → SHA-256
  │                            │ find EmailVerification in DB
  │                            │ check: not used, not expired
  │                            │ mark token as used
  │                            │ set user.isVerified = true, isActive = true
  │                            │ invalidate user cache
  │                            │── enqueueEmail(WELCOME) ──▶ Queue
  │◀── 200 { message } ────────│
```

### 8.3 Login Flow

```
Client                              Authy                       Redis
  │                                   │                            │
  │── POST /login ───────────────────▶│                            │
  │                                   │ findByEmail                │
  │                                   │ check isActive             │
  │                                   │ check lockedUntil          │
  │                                   │ bcrypt.compare(password)   │
  │                                   │   if wrong:                │
  │                                   │     increment attempts     │
  │                                   │     if >= max: lock account│
  │                                   │ check isVerified           │
  │                                   │ resetLoginAttempts()       │
  │                                   │ generateAccessToken (JWT)  │
  │                                   │ generateRefreshToken (JWT) │
  │                                   │ hash refreshToken → DB     │
  │                                   │── setUser cache ──────────▶│
  │◀── 200 { user, tokens } ──────────│                            │
```

### 8.4 Token Refresh Flow (Rotation)

```
Client                                Authy                          DB           Redis
  │                                     │                             │             │
  │── POST /refresh { refreshToken } -─▶│                             │             │
  │                                     │ verifyRefreshToken (JWT)    │             │
  │                                     │ hash token → SHA-256        │             │
  │                                     │── findRefreshToken ────────▶│             │
  │                                     │ check: not revoked          │             │
  │                                     │ check: not expired          │             │
  │                                     │── revokeRefreshToken ──────▶│ (OLD)       │
  │                                     │ generateAccessToken (new)   │             │
  │                                     │ generateRefreshToken (new)  │             │
  │                                     │── createRefreshToken ──────▶│ (NEW hash)  │
  │◀── 200 { tokens (new pair) } ──────▶│                             │             │
```

### 8.5 Logout Flow

```
Client                              Authy                       DB          Redis
  │                                   │                          │             │
  │── POST /logout { refreshToken } ─▶│                          │             │
  │   Authorization: Bearer <token>   │                          │             │
  │                                   │ extract jti from JWT     │             │
  │                                   │ extract exp from JWT     │             │
  │                                   │── blacklistAccessToken ───────────────▶│ (TTL = remaining)
  │                                   │── revokeRefreshToken ───▶│             │
  │◀── 200 { message } ───────────────│                          │             │
```

### 8.6 Logout All Devices Flow

```
Authy:
  1. revokeAllUserRefreshTokens(userId) → marks ALL refresh tokens isRevoked=true
  2. setUserRevocationTime(userId, now) → Redis key with 30-day TTL
  3. blacklistAccessToken(jti, remaining) → current token blacklisted too
  4. invalidateUser(userId) → clear user cache

On any future request with an old access token:
  auth.middleware → isAccessTokenRevoked(jti, userId, iat)
    → checks Redis blacklist (per-JTI)
    → checks revocation timestamp (iat < revoke_before)
    → returns true → 401 Unauthorized
```

### 8.7 Password Reset Flow

```
Client                               Authy
  │                                    │
  │── POST /forgot-password ──────────▶│ (always returns same response)
  │                                    │ find user by email
  │                                    │ generate secure random token
  │                                    │ hash token → store in DB (1hr expiry)
  │                                    │── enqueueEmail(RESET) ──▶ Queue
  │◀── 200 (enumeration-safe msg) ─────│
  │
  │ [User clicks link in email]
  │
  │── POST /reset-password ───────────▶│
  │   { token, newPassword }           │ hash token → find in DB
  │                                    │ check: not used, not expired
  │                                    │ validate password strength
  │                                    │ check password history (last 5)
  │                                    │ hash new password
  │                                    │ update user.passwordHash
  │                                    │ add to password history
  │                                    │ mark reset token as used
  │                                    │ revoke ALL refresh tokens (force re-login)
  │                                    │── setRevocationTime ──▶ Redis
  │                                    │── enqueueEmail(PWD_CHANGED) ──▶ Queue
  │◀── 200 { message } ────────────────│
```

---

## 9. ACL / Multi-App RBAC System

Authy acts as a central permission authority for registered client applications. The model is **Apps → Features → Roles → UserApp memberships → per-user overrides**.

### 9.1 Permission Model

```
App
├── Feature[] (e.g. view_transactions, approve_transaction)
├── AppRole[]
│    └── RoleFeature[] → Feature[]   (which features this role grants)
└── UserApp[]
     ├── user     → User
     ├── role     → AppRole (optional)
     └── UserFeature[] (per-user overrides, grant or revoke individual features)
```

A user's effective feature set for an app = **role features** + **direct grants** − **direct revocations**.

### 9.2 Feature Sync Flow

Client apps typically self-register their features at startup without needing manual admin setup:

```
Client App                          Authy                      Admin (UI)
  │                                   │                            │
  │── POST /internal/sync-features ──▶│                            │
  │   X-Internal-API-Key: ...         │ validate app secret        │
  │   X-App-Secret: <raw-secret>      │ create FeatureSyncRequest  │
  │                                   │── notify subscribed ──────▶│
  │◀── 201 { requestId, ... } ────────│                            │
  │                                   │                            │ (reviews queue)
  │                                   │◀── PUT /approve ───────────│
  │                                   │ upsertFeature() × N        │
  │                                   │ mark request APPROVED      │
```

### 9.3 Role Version & Stale Permission Detection

When an admin changes a role's features or metadata, the role's `version` is incremented. All users with that role have their sessions immediately invalidated (via `revokeAllUserRefreshTokens` + `setUserRevocationTime`).

JWT access tokens embed a snapshot of the user's app permissions at login time, including `roleVersion`. When a service calls `POST /internal/verify-token` with its app secret, Authy compares the JWT's cached `roleVersion` against the current DB value:

```
permissionsStale = (jwt.appPermissions[appId].roleVersion !== currentRole.version)
```

If `true`, the service should signal the client to re-authenticate. This avoids the need to validate permissions on every request by hitting the DB — the stale flag is the invalidation signal.

### 9.4 Session Invalidation on Access Changes

Any of these actions triggers immediate session invalidation for the affected user(s):

| Action                            | Scope                                     |
| --------------------------------- | ----------------------------------------- |
| Role feature set updated          | All users with that role                  |
| Role definition updated           | All users with that role                  |
| Role deleted                      | All users with that role                  |
| User's app role changed           | That user                                 |
| User's per-user overrides updated | That user                                 |
| User removed from app             | That user                                 |
| App suspended/reactivated         | Not invalidated (app-level, not per-user) |

Session invalidation = `revokeAllUserRefreshTokens` + `setUserRevocationTime` + `invalidateUser cache`.

---

## 10. Admin Notification System

### 10.1 Event Types

| Event Type            | Triggered by                                 |
| --------------------- | -------------------------------------------- |
| `APP_REGISTRATION`    | A new app is registered via `POST /acl/apps` |
| `FEATURE_SYNC`        | A client app submits a feature sync request  |
| `USER_ACCESS_GRANTED` | A user is assigned to an app                 |
| `USER_ACCESS_REVOKED` | A user is removed from an app                |
| `ROLE_MODIFIED`       | A role's definition or features are updated  |

### 10.2 Dispatch Flow

```
AclService / AuthService
  │
  │── notificationService.dispatch(eventType, appId, title, body, metadata)
        │
        │ find all adminIds subscribed to (eventType, appId or GLOBAL)
        │
        ├── notificationRepository.createMany(notifications)   → in-app inbox
        │
        └── for each adminId:
              enqueueEmail(SEND_ADMIN_NOTIFICATION, adminEmail, title, body)
```

The dispatch is always wrapped in `try/catch` — a notification failure never propagates to the user-facing request.

### 10.3 Subscription Scoping

A subscription record has three identifying fields: `adminId`, `eventType`, `scope`.

- `scope = "GLOBAL"` → admin receives this event type for **all apps**
- `scope = "<appId>"` → admin receives this event type only for that specific app

Dispatch queries for admins subscribed to `(eventType, "GLOBAL")` OR `(eventType, appId)`.

---

## 11. Security Features

### 11.1 Password Security

- **Hashing:** bcrypt with configurable rounds (default 12; rounds=4 in tests for speed)
- **Strength requirements:** ≥ 8 chars, uppercase, lowercase, digit, special char
- **History enforcement:** Last N passwords stored as bcrypt hashes; new password checked against all of them
- **Never logged:** Passwords sanitized from all log output via Winston format (`***REDACTED***`)

### 11.2 JWT Security

| Property              | Value                                                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| Algorithm             | HS256 (HMAC-SHA256)                                                            |
| Access token TTL      | 15 minutes (configurable)                                                      |
| Refresh token TTL     | 7 days (configurable)                                                          |
| Access token JTI      | UUID per token (for precise blacklisting)                                      |
| Refresh token storage | SHA-256 hash stored in DB (not plaintext)                                      |
| Token rotation        | Every refresh invalidates old refresh token                                    |
| Logout blacklist      | JTI → Redis with TTL = remaining access token lifetime                         |
| Logout-all            | Per-user revocation timestamp in Redis; any token issued before it is rejected |

### 11.3 Account Lockout

- After `MAX_LOGIN_ATTEMPTS` (default 5) consecutive failed logins, the account is locked
- `lockedUntil` is set to `now + LOCKOUT_DURATION_MINUTES`
- Login fails with `429 Too Many Requests` while locked; the response message includes remaining minutes
- Lockout resets automatically when `lockedUntil` expires
- A successful login resets `failedLoginAttempts` to 0

### 11.4 HTTP Security Headers (Helmet)

Helmet sets the following headers on every response:

- `Content-Security-Policy`
- `X-DNS-Prefetch-Control`
- `X-Frame-Options: SAMEORIGIN`
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Permitted-Cross-Domain-Policies`
- `Referrer-Policy`
- `X-XSS-Protection`

### 11.5 CORS

- In development: all origins allowed (easy local testing)
- In production: only `FRONTEND_URL` is allowed
- Credentials (`Authorization` header) are explicitly enabled
- Exposed headers: `X-Request-ID`

### 11.6 Request Body Limits

Express body parser is configured with `limit: "10kb"` to prevent payload flooding attacks.

### 11.7 Sensitive Data in Logs

Winston format sanitizes the following fields before any log output:

- `password`, `passwordHash`
- `token`, `accessToken`, `refreshToken`
- `authorization`, `cookie`
- `passwordResetToken`, `emailVerificationToken`

Emails are partially masked (`u***@example.com`) and IPs are masked (`192.168.***.***`).

### 11.8 Enumeration Protection

The following endpoints always return the same success response regardless of whether the email exists:

- `POST /forgot-password`
- `POST /resend-verification`

### 11.9 App Secret Security

- App secrets are generated as 32-byte cryptographically random hex strings
- Only the SHA-256 hash is stored in the database — the raw secret is shown once at registration and never again
- Admins can rotate secrets via `POST /acl/apps/:appId/regenerate-secret`

---

## 12. Message Queue

Authy uses **BullMQ** (Redis-backed) for all email delivery. This decouples the HTTP response time from SMTP latency.

### Queue: `authy:email`

| Job Type                      | Trigger                                         | Template                           |
| ----------------------------- | ----------------------------------------------- | ---------------------------------- |
| `send-verification-email`     | Registration, resend-verification               | Inline HTML with verification link |
| `send-password-reset-email`   | Forgot password                                 | Inline HTML with reset link        |
| `send-welcome-email`          | Email verified                                  | Inline HTML welcome message        |
| `send-password-changed-email` | Reset/change password                           | Inline HTML security notification  |
| `send-admin-notification`     | Notification dispatch (ACL events, direct send) | Inline HTML admin alert            |

### Job Configuration

```ts
defaultJobOptions: {
  attempts: 3,                        // Retry up to 3 times on failure
  backoff: { type: "exponential", delay: 5000 },  // 5s, 10s, 20s
  removeOnComplete: { count: 100 },   // Keep last 100 completed
  removeOnFail: { count: 500 },       // Keep last 500 failed for inspection
}
```

### Worker

- **Concurrency:** 5 simultaneous jobs
- **Processor:** `processEmailJob()` in `email.service.ts`
- **Dev mode:** If SMTP is not configured, emails are logged to console (`[EMAIL-DEV]`) instead of sent — no crashes, no noise

### Connection

BullMQ uses its own ioredis connection (separate from the main Redis client), configured from the same `REDIS_*` environment variables.

### Graceful Shutdown

On SIGTERM/SIGINT: `closeQueues()` closes the worker (drains active jobs) then closes the queue connection.

---

## 13. Caching Strategy

All caching uses the main Redis client. Keys are namespaced with `authy:` prefix.

### Cache Keys

| Key Pattern                    | TTL                 | Value                    | Purpose                                |
| ------------------------------ | ------------------- | ------------------------ | -------------------------------------- |
| `authy:user:{userId}`          | 300s (5 min)        | JSON `UserResponse`      | Avoid DB lookup on `/me`               |
| `authy:bl:access:{jti}`        | Remaining token TTL | `"1"`                    | Token blacklist on logout              |
| `authy:revoke_before:{userId}` | 30 days             | Unix timestamp (seconds) | Invalidate all tokens before timestamp |

### Cache Invalidation

| Event                   | Invalidated Keys                                                   |
| ----------------------- | ------------------------------------------------------------------ |
| Logout                  | `authy:bl:access:{jti}` added                                      |
| Logout all              | `authy:revoke_before:{userId}` set + `authy:user:{userId}` deleted |
| Suspend/activate user   | `authy:user:{userId}` deleted + revocation timestamp set           |
| Password reset/change   | `authy:user:{userId}` deleted + revocation timestamp set           |
| Role updated/deleted    | All users with that role → sessions invalidated                    |
| User-app access changed | That user → sessions invalidated                                   |

### Cache Failure Behavior

All Redis cache operations are wrapped in `try/catch`. Cache failures log a warning but **never throw** — the application falls back to the database. This ensures Redis is a performance optimization, not a critical dependency for correctness.

---

## 14. Audit & Access Logging

### 14.1 Audit Logs (Database)

Every security-relevant action is persisted to the `AuditLog` table.

**Captured Actions:**

| Action                     | Trigger                                |
| -------------------------- | -------------------------------------- |
| `USER_REGISTERED`          | Successful registration                |
| `LOGIN_SUCCESS`            | Successful login                       |
| `LOGIN_FAILED`             | Wrong password or non-existent user    |
| `LOGOUT`                   | POST /logout                           |
| `LOGOUT_ALL`               | POST /logout-all                       |
| `TOKEN_REFRESHED`          | POST /refresh                          |
| `EMAIL_VERIFICATION_SENT`  | Resend verification                    |
| `EMAIL_VERIFIED`           | GET /verify-email                      |
| `PASSWORD_RESET_REQUESTED` | POST /forgot-password                  |
| `PASSWORD_RESET_COMPLETED` | POST /reset-password                   |
| `PASSWORD_CHANGED`         | PUT /change-password                   |
| `ACCOUNT_LOCKED`           | Max login attempts exceeded            |
| `ACCOUNT_UNLOCKED`         | Admin activates user                   |
| `ACCOUNT_DEACTIVATED`      | Admin suspends user                    |
| `ACCOUNT_DELETED`          | Admin deletes user                     |
| `FORCE_ACTIVATED`          | Admin force-activates unverified user  |
| `APP_CREATED`              | Admin registers a new app              |
| `APP_UPDATED`              | Admin updates app metadata             |
| `APP_SUSPENDED`            | Admin suspends an app                  |
| `APP_REACTIVATED`          | Admin reactivates an app               |
| `APP_SECRET_REGENERATED`   | Admin rotates an app secret            |
| `FEATURE_ADDED`            | Admin adds a feature directly          |
| `FEATURE_UPDATED`          | Admin updates a feature                |
| `FEATURE_REMOVED`          | Admin removes a feature                |
| `SYNC_REQUEST_APPROVED`    | Admin approves a feature sync request  |
| `SYNC_REQUEST_REJECTED`    | Admin rejects a feature sync request   |
| `ROLE_CREATED`             | Admin creates a role                   |
| `ROLE_UPDATED`             | Admin updates a role                   |
| `ROLE_DELETED`             | Admin deletes a role                   |
| `ROLE_FEATURES_SET`        | Admin sets a role's feature list       |
| `USER_APP_ASSIGNED`        | Admin assigns a user to an app         |
| `USER_APP_UPDATED`         | Admin changes a user's app access/role |
| `USER_APP_REMOVED`         | Admin removes a user from an app       |
| `USER_FEATURES_SET`        | Admin sets per-user feature overrides  |

Each entry captures: `userId`, `action`, `details` (JSON), `ipAddress`, `userAgent`, `requestId`.

**Design principle:** `auditService.log()` is fire-and-forget. If the DB write fails, it logs an error but **never propagates the exception** — the user-facing request always completes.

### 14.2 Access Logs (File)

Every HTTP request/response is logged via Winston's access-log middleware:

```
2026-05-02 12:00:00 [INFO]: HTTP { "requestId": "...", "method": "POST", "path": "/api/v1/auth/login", "statusCode": 200, "duration": "42ms", "ip": "192.168.***.**", "userAgent": "..." }
```

Log level varies by status code:

- 5xx → `error`
- 4xx → `warn`
- 2xx/3xx → `info`

**Log files:**

- `logs/combined.log` — all log levels
- `logs/error.log` — error level only
- Rotation: 20 MB max per file, 14 files retained

---

## 15. Service-to-Service (S2S) API

Other microservices can validate user tokens and query permissions without sharing secrets.

### Authentication

Every request to `/api/v1/internal/*` must include:

```
X-Internal-API-Key: <INTERNAL_API_KEY>
```

For app-specific routes (`/sync-features`, `/users/:userId/permissions`), also include:

```
X-App-Secret: <raw-app-secret>
```

Generate the API key with `openssl rand -hex 32`.

### Typical Usage — Basic Token Verify

```ts
const response = await fetch("http://auth-service:3031/api/v1/internal/verify-token", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Internal-API-Key": process.env.INTERNAL_API_KEY,
  },
  body: JSON.stringify({ token: req.headers.authorization?.slice(7) }),
});

const { data } = await response.json();
if (!data.valid) return res.status(401).json({ error: "Unauthorized" });

req.user = data.user; // { id, email, role, isVerified, ... }
```

### Typical Usage — Permission-Aware Verify (Recommended)

```ts
const response = await fetch("http://auth-service:3031/api/v1/internal/verify-token", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Internal-API-Key": process.env.INTERNAL_API_KEY,
    "X-App-Secret": process.env.APP_SECRET,
  },
  body: JSON.stringify({ token: req.headers.authorization?.slice(7) }),
});

const { data } = await response.json();
if (!data.valid) return res.status(401).json({ error: "Unauthorized" });
if (data.permissionsStale) {
  return res.status(401).json({ error: "Token outdated — please re-login" });
}

const hasFeature = data.appPermission?.features?.includes("approve_transaction");
if (!hasFeature) return res.status(403).json({ error: "Forbidden" });
```

### Feature Sync at Service Startup

```ts
// Called once on service startup to register features with Authy
await fetch("http://auth-service:3031/api/v1/internal/sync-features", {
  method: "POST",
  headers: {
    "X-Internal-API-Key": process.env.INTERNAL_API_KEY,
    "X-App-Secret": process.env.APP_SECRET,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    features: [
      { key: "view_transactions", displayName: "View Transactions" },
      { key: "approve_transaction", displayName: "Approve Transaction" },
    ],
  }),
});
// Admin will see a pending sync request in the Authy UI to approve
```

---

## 16. Error Handling

### Error Hierarchy

```
Error
└── AppError (isOperational: true)
    ├── ValidationError      (400 VALIDATION_ERROR)
    ├── AuthenticationError  (401 AUTHENTICATION_ERROR)
    ├── AuthorizationError   (403 AUTHORIZATION_ERROR)
    ├── NotFoundError        (404 NOT_FOUND_ERROR)
    ├── ConflictError        (409 CONFLICT_ERROR)
    ├── TooManyRequestsError (429 RATE_LIMIT_ERROR)
    ├── AccountLockedError   (429 RATE_LIMIT_ERROR + lockedUntil)
    └── DatabaseError        (500 DATABASE_ERROR)
```

### Error Codes

| Code                   | HTTP | Meaning                                             |
| ---------------------- | ---- | --------------------------------------------------- |
| `VALIDATION_ERROR`     | 400  | Request body/query/params failed Zod validation     |
| `AUTHENTICATION_ERROR` | 401  | Missing/invalid/expired token or bad credentials    |
| `AUTHORIZATION_ERROR`  | 403  | Authenticated but lacks required role               |
| `NOT_FOUND_ERROR`      | 404  | Resource not found                                  |
| `CONFLICT_ERROR`       | 409  | Duplicate resource (e.g., email already registered) |
| `RATE_LIMIT_ERROR`     | 429  | Too many requests or account locked                 |
| `DATABASE_ERROR`       | 500  | DB operation failed                                 |
| `INTERNAL_ERROR`       | 500  | Unhandled / programming error (sanitized message)   |

### Operational vs. Programming Errors

- **Operational errors** (`isOperational: true`) — expected failures (bad input, auth failure). Response includes the actual message.
- **Programming errors** (unexpected `Error` subclasses) — bugs. Response always says "An unexpected error occurred". Full stack trace logged server-side.

---

## 17. Rate Limiting

Three rate limiters are configured using `express-rate-limit` with in-memory storage.

| Limiter             | Scope  | Window | Max | Applied to                                |
| ------------------- | ------ | ------ | --- | ----------------------------------------- |
| `globalRateLimiter` | Per IP | 15 min | 100 | All routes                                |
| `authRateLimiter`   | Per IP | 15 min | 5   | `/register`, `/login`, `/forgot-password` |
| `resendRateLimiter` | Per IP | 1 hour | 3   | `/resend-verification`                    |

When a limit is exceeded, the response is `429 Too Many Requests` with standard headers (`RateLimit-*`).

> **Production note:** For multi-instance deployments, replace the in-memory store with `rate-limit-redis` to share state across instances.

---

## 18. Setup & Running

### Prerequisites

- Node.js ≥ 20
- PostgreSQL 16
- Redis 7
- An SMTP server (optional; emails are logged in development if not configured)

### Local Setup (without Docker)

```bash
# 1. Clone and install
git clone <repo>
cd authy
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — fill in DATABASE_URL, REDIS_HOST, JWT secrets

# 3. Generate Prisma client
npm run prisma:generate

# 4. Run database migrations
npm run prisma:migrate
# Prompts for a migration name, e.g.: "init"

# 5. Start in development mode (hot reload)
npm run dev
```

The server starts at `http://localhost:3031` (or the `PORT` you set).

### Scripts Reference

| Script                     | Command                        | Description                                    |
| -------------------------- | ------------------------------ | ---------------------------------------------- |
| `npm run dev`              | `nodemon ts-node src/index.ts` | Dev server with hot reload                     |
| `npm run build`            | `tsc && tsc-alias`             | Compile TypeScript to `dist/`                  |
| `npm start`                | `node dist/index.js`           | Run compiled production build                  |
| `npm test`                 | `jest`                         | Run all tests                                  |
| `npm run test:unit`        | `jest tests/unit`              | Unit tests only                                |
| `npm run test:integration` | `jest tests/integration`       | Integration tests only                         |
| `npm run test:coverage`    | `jest --coverage`              | Tests + HTML coverage report                   |
| `npm run prisma:generate`  | `prisma generate`              | Re-generate Prisma client after schema changes |
| `npm run prisma:migrate`   | `prisma migrate dev`           | Apply pending migrations                       |
| `npm run prisma:studio`    | `prisma studio`                | Visual DB browser at localhost:5555            |

---

## 19. Docker Deployment

### Starting all services

```bash
# Start PostgreSQL + Redis + Auth Service
npm run docker:up

# View logs
npm run docker:logs

# Stop
npm run docker:down
```

### docker-compose.yml structure

The compose file defines three services:

- **`db`** — PostgreSQL 16 with named volume
- **`redis`** — Redis 7 with named volume
- **`auth-service`** — Authy (built from Dockerfile), depends on db + redis

All three are on a dedicated bridge network (`auth-network`).

### Dockerfile

Multi-stage build:

1. **builder** — installs all deps, generates Prisma client, compiles TypeScript
2. **runtime** — copies only `dist/`, `node_modules/`, `prisma/` — no dev tools or source

### Environment in Docker

Set environment variables in `docker-compose.yml` or pass via `--env-file .env`:

```yaml
environment:
  DATABASE_URL: "postgresql://postgres:postgres@db:5432/auth_db"
  REDIS_HOST: redis
  # ... rest of vars
```

### Health Check (for orchestrators like Kubernetes)

```
Liveness probe: GET /health
Readiness probe: GET /health/ready
```

---

## 20. Testing

### Running Tests

```bash
npm test                   # all tests
npm run test:unit          # only unit tests (no DB/Redis needed)
npm run test:integration   # integration tests (mocked infrastructure)
npm run test:coverage      # with HTML coverage report → ./coverage/
```

### Test Architecture

**Unit tests** (`tests/unit/`) — test individual functions in isolation. No database, no Redis, no network. Fast (~1–2s for all).

**Integration tests** (`tests/integration/`) — spin up the full Express app via supertest, with all database/Redis/queue dependencies mocked via `jest.mock()`. Test the full HTTP request/response cycle including middleware.

### Test Configuration

- `jest.config.ts` — root jest config with `ts-jest`, path alias mapper, 30s timeout
- `tsconfig.test.json` — extends `tsconfig.json` but switches to `"module": "commonjs"` and `"moduleResolution": "node"` for Jest compatibility

### Test Coverage

| Layer              | Test file                         | What's covered                                                       |
| ------------------ | --------------------------------- | -------------------------------------------------------------------- |
| Password utils     | `unit/password.utils.test.ts`     | hash, compare, strength validation (every rule)                      |
| JWT utils          | `unit/jwt.utils.test.ts`          | generate/verify access + refresh tokens, expiry, wrong secret        |
| Token utils        | `unit/token.utils.test.ts`        | random generation, SHA-256 hashing, expiry dates                     |
| Validation schemas | `unit/validation.schemas.test.ts` | all Zod schemas, edge cases                                          |
| Error classes      | `unit/errors.test.ts`             | all 9 custom error classes, status codes, messages                   |
| Auth endpoints     | `integration/auth.test.ts`        | register, login, refresh, verify-email, forgot-password, /me, health |

### See Also

`tests/TESTS.md` — comprehensive test plan with 200+ individual test cases organized by category (unit, service, middleware, integration, E2E, security).

---
