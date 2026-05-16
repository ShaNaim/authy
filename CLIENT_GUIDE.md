# Authy — Client Integration Guide

> This guide is for **third-party developers and organizations** who want to integrate Authy into their product to handle authentication, user management, and permission checks.

---

## Table of Contents

1. [How it works](#1-how-it-works)
2. [Getting started](#2-getting-started)
3. [Registering and logging in your users](#3-registering-and-logging-in-your-users)
4. [OAuth 2.0 — letting users sign in with Authy](#4-oauth-20--letting-users-sign-in-with-authy)
5. [API Keys](#5-api-keys)
6. [Checking permissions](#6-checking-permissions)
7. [Webhooks — receiving real-time events](#7-webhooks--receiving-real-time-events)
8. [Plans and limits](#8-plans-and-limits)
9. [Error reference](#9-error-reference)
10. [Quick-start examples](#10-quick-start-examples)

---

## 1. How it works

Authy is a hosted authentication platform. Your application never handles passwords or sessions directly — you delegate that to Authy via API calls.

There are two ways to integrate:

| Mode | Best for | How it works |
|---|---|---|
| **Org API** | Backend-to-backend (server-side only) | Your server calls Authy with your org secret to register/login users. Authy returns the user record. |
| **OAuth 2.0** | User-facing login buttons ("Sign in with Authy") | Users authenticate directly with Authy in their browser via a standard authorization code flow. Your server receives a signed JWT. |

For permission checks, both modes use the same **Check API** authenticated with an API key.

---

## 2. Getting started

### Step 1 — Get your organization credentials

Contact your Authy admin (or create an org via the dashboard) to receive:

- **Org Secret** — used to authenticate server-side Org API calls
- **Dashboard access** — to manage API keys, OAuth apps, and webhooks

### Step 2 — Create an API key

Log in to the dashboard → **Organization → API Keys → New key**.

- Give it a name (e.g. "Production Backend")
- Select the scopes your integration needs (see [API Keys](#5-api-keys))
- Copy the key immediately — it is only shown once

### Step 3 — Choose your mode

- For **server-side user management** → [Section 3](#3-registering-and-logging-in-your-users)
- For **browser-based login** → [Section 4](#4-oauth-20--letting-users-sign-in-with-authy)

---

## 3. Registering and logging in your users

The **Org API** is your server talking directly to Authy. All calls use your **org secret** in the `Authorization` header. Never expose this secret client-side.

### Base URL

```
https://your-authy-instance.com/api/v1
```

### Authentication

```http
Authorization: Bearer <your-org-secret>
```

---

### Register a user

```http
POST /org-api/register
Authorization: Bearer <org-secret>
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "Str0ng!Pass#",
  "firstName": "Alice",
  "lastName": "Smith",
  "mode": "full"
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "email": "alice@example.com",
      "firstName": "Alice",
      "lastName": "Smith",
      "isVerified": true,
      "isActive": true,
      "organizationId": "org_xyz",
      "createdAt": "2026-05-16T10:00:00Z"
    }
  }
}
```

Org-registered users are **auto-verified and active** — no email verification step needed.

**Auth modes**

| `mode` | When to use |
|---|---|
| `"full"` | Authy manages the password. Pass `password` in the request. |
| `"delegated"` | Your system manages credentials. You tell Authy the user is valid; Authy stores the record without a usable password. |

---

### Log in a user

```http
POST /org-api/login
Authorization: Bearer <org-secret>
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "Str0ng!Pass#",
  "mode": "full"
}
```

In `delegated` mode, omit `password` — your system already validated it.

**Response**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "email": "alice@example.com",
      ...
    }
  }
}
```

> **Note:** The Org API returns the user record only, not a JWT. If your application needs the user to call Authy-protected endpoints directly (e.g. to use the Check API from a mobile app), use the OAuth flow instead.

---

## 4. OAuth 2.0 — letting users sign in with Authy

Authy implements **Authorization Code + PKCE** (RFC 7636). This is the correct flow for web apps and mobile apps where the user authenticates in their browser.

### Step 1 — Register an OAuth app

Dashboard → **Organization → OAuth Apps → New app**.

You'll receive a `clientId`. The `clientSecret` is shown once — store it securely on your backend.

### Step 2 — Generate a PKCE code verifier and challenge

```js
const crypto = require("crypto");

// Generate a random 32-byte verifier (URL-safe base64)
const codeVerifier = crypto.randomBytes(32).toString("base64url");

// SHA-256 hash of the verifier (also URL-safe base64)
const codeChallenge = crypto
  .createHash("sha256")
  .update(codeVerifier)
  .digest("base64url");
```

Store `codeVerifier` in your session — you'll need it in Step 4.

### Step 3 — Redirect the user to Authy

```
GET https://your-authy-instance.com/api/v1/oauth/authorize
  ?response_type=code
  &client_id=<your-client-id>
  &redirect_uri=https://your-app.com/auth/callback
  &code_challenge=<codeChallenge>
  &code_challenge_method=S256
  &scope=openid profile email
```

The user authenticates on Authy's UI. On success, Authy redirects back:

```
https://your-app.com/auth/callback?code=<authorization-code>
```

### Step 4 — Exchange the code for tokens (server-side)

```http
POST /api/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<authorization-code>
&code_verifier=<codeVerifier>
&client_id=<your-client-id>
&redirect_uri=https://your-app.com/auth/callback
```

**Response**

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImF1dGh5LWtleS0xIn0...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "openid profile email"
}
```

### Step 5 — Verify the access token on your backend

OAuth tokens are **RS256 JWTs**. Verify them locally using Authy's public key — no round-trip needed.

```js
const jwksClient = require("jwks-rsa");
const jwt = require("jsonwebtoken");

const client = jwksClient({
  jwksUri: "https://your-authy-instance.com/.well-known/jwks.json",
});

async function verifyToken(token) {
  const decoded = jwt.decode(token, { complete: true });
  const key = await client.getSigningKey(decoded.header.kid);
  return jwt.verify(token, key.getPublicKey(), { algorithms: ["RS256"] });
}
```

**Token payload**

```json
{
  "sub": "usr_abc123",
  "email": "alice@example.com",
  "orgId": "org_xyz",
  "appId": "my-app",
  "scope": "openid profile email",
  "type": "oauth_access",
  "iat": 1716000000,
  "exp": 1716000900,
  "iss": "https://your-authy-instance.com"
}
```

> **Note:** The `iss` (issuer) claim is the full base URL of your Authy instance, not a plain string. OIDC libraries that auto-discover configuration will validate this against the `issuer` field in the discovery document — make sure the URLs match exactly.

### OIDC Discovery

```
GET https://your-authy-instance.com/.well-known/openid-configuration
GET https://your-authy-instance.com/.well-known/jwks.json
```

The discovery document includes all required OIDC Discovery 1.0 fields:

```json
{
  "issuer": "https://your-authy-instance.com",
  "authorization_endpoint": "https://your-authy-instance.com/api/v1/oauth/authorize",
  "token_endpoint": "https://your-authy-instance.com/api/v1/oauth/token",
  "introspection_endpoint": "https://your-authy-instance.com/api/v1/oauth/introspect",
  "jwks_uri": "https://your-authy-instance.com/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["client_secret_post"],
  "scopes_supported": ["openid", "profile", "email"]
}
```

---

## 5. API Keys

API keys authenticate your **server-to-Authy** calls for the Check API and other integration endpoints. They are separate from the org secret.

### Key format

```
sk_live_a3f8c91d4b2e78...    ← production
sk_test_b2e7d40c9a1f56...    ← testing / staging
```

### Scopes

| Scope | What it allows |
|---|---|
| `check` | Call `POST /check` and `POST /check/batch` |
| `users:read` | Read user data |
| `apps:read` | Read app/feature configuration |
| `webhooks:write` | Trigger webhook-related actions |

### Using an API key

Pass it in the `X-Authy-Key` header:

```http
POST /api/v1/check
X-Authy-Key: sk_live_a3f8c91d...
Content-Type: application/json
```

### Security practices

- Store API keys in environment variables, never in source code
- Create separate keys for each environment (dev, staging, prod)
- Use `sk_test_` keys in non-production environments
- Revoke compromised keys immediately from the dashboard
- Assign only the scopes each key actually needs

---

## 6. Checking permissions

The Check API tells you whether a user has access to a specific feature, in sub-millisecond time. Results are cached in Redis for 60 seconds.

### Single check

```http
POST /api/v1/check
X-Authy-Key: sk_live_...
Content-Type: application/json

{
  "token": "<user access token>",
  "feature": "reports:export"
}
```

**Response**

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

Check multiple features in a single request:

```http
POST /api/v1/check/batch
X-Authy-Key: sk_live_...
Content-Type: application/json

{
  "token": "<user access token>",
  "features": ["reports:export", "users:invite", "billing:view"]
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "results": {
      "reports:export": true,
      "users:invite": false,
      "billing:view": true
    }
  }
}
```

### Express.js middleware example

```js
function requireFeature(feature) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.slice(7);
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const response = await fetch("https://your-authy-instance.com/api/v1/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authy-Key": process.env.AUTHY_API_KEY,
      },
      body: JSON.stringify({ token, feature }),
    });

    const { data } = await response.json();
    if (!data.allowed) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

// Usage
app.get("/reports/export", requireFeature("reports:export"), exportHandler);
```

---

## 7. Webhooks — receiving real-time events

Webhooks let Authy push events to your server the moment something happens, instead of you polling for changes.

### Registering an endpoint

Dashboard → **Organization → Webhooks → Add endpoint**.

Enter your HTTPS endpoint URL and select the events to subscribe to.

### Supported events

| Event | Fired when |
|---|---|
| `USER_CREATED` | A user registers via the Org API |
| `USER_LOGIN` | A user successfully logs in |
| `USER_LOGIN_FAILED` | A login attempt fails (wrong password, locked, etc.) |
| `USER_DELETED` | A user record is deleted |
| `USER_PASSWORD_CHANGED` | A user changes their password |
| `ROLE_UPDATED` | A role's permissions are changed |
| `APP_CREATED` | A new application is registered |
| `FEATURE_SYNCED` | A feature sync request is approved |

### What Authy sends

```http
POST https://your-app.com/webhooks/authy
Content-Type: application/json
X-Authy-Event: USER_CREATED
X-Authy-Signature: a3f8c91d4b2e78...
X-Authy-Delivery-Id: 550e8400-e29b-41d4-a716-446655440000

{
  "event": "USER_CREATED",
  "organizationId": "org_xyz",
  "timestamp": "2026-05-16T10:05:00Z",
  "data": {
    "userId": "usr_abc123",
    "email": "alice@example.com"
  }
}
```

### Verifying the signature

**Always verify signatures** before processing a webhook. This prevents replay attacks and spoofed events.

```js
const crypto = require("crypto");

function isValidWebhook(rawBody, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)          // Must be the raw body string, not parsed JSON
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature, "utf8"),
    Buffer.from(expected, "utf8")
  );
}

// Express example
app.post("/webhooks/authy", express.raw({ type: "application/json" }), (req, res) => {
  const signature = req.headers["x-authy-signature"];
  const secret = process.env.AUTHY_WEBHOOK_SECRET; // From your dashboard

  if (!isValidWebhook(req.body, signature, secret)) {
    return res.status(401).send("Invalid signature");
  }

  const event = JSON.parse(req.body);
  console.log("Received event:", event.event, event.data);

  res.status(200).send("OK");
});
```

> **Important:** Use `express.raw()` or equivalent to receive the unparsed body. Passing through a JSON body parser alters whitespace and breaks the signature.

### Retry behavior

If your endpoint is unreachable or returns a non-2xx status, Authy retries the delivery 3 times with exponential backoff (10s, 20s, 40s). You can inspect failed deliveries in the dashboard under **Webhooks → View deliveries**.

### Responding quickly

Webhook handlers should respond within **10 seconds**. If your processing takes longer, acknowledge immediately and handle asynchronously:

```js
app.post("/webhooks/authy", express.raw({ type: "application/json" }), (req, res) => {
  // Verify and acknowledge immediately
  if (!isValidWebhook(req.body, req.headers["x-authy-signature"], WEBHOOK_SECRET)) {
    return res.status(401).send("Invalid signature");
  }
  res.status(200).send("OK"); // Acknowledge before processing

  // Process in background
  setImmediate(() => {
    const event = JSON.parse(req.body);
    handleEvent(event).catch(console.error);
  });
});
```

---

## 8. Plans and limits

Your organization's plan determines how many requests and resources you can use. Limits are enforced in real time — exceeding them returns `429 PLAN_LIMIT_EXCEEDED`.

| Resource | FREE | STARTER | PRO | ENTERPRISE |
|---|---|---|---|---|
| Monthly active users | 1,000 | 10,000 | 100,000 | Unlimited |
| API calls / day | 5,000 | 50,000 | 500,000 | Unlimited |
| Apps | 2 | 10 | 50 | Unlimited |
| Feature keys | 20 | 100 | 500 | Unlimited |
| API keys | 2 | 10 | 50 | Unlimited |
| OAuth apps | 1 | 5 | 20 | Unlimited |
| Webhooks | 2 | 10 | 50 | Unlimited |
| Audit log retention | 7 days | 30 days | 90 days | 365 days |

### Checking your current usage

```http
GET /api/v1/org/usage
Authorization: Bearer <dashboard-user-JWT>
```

```json
{
  "data": {
    "plan": "STARTER",
    "limits": { "maxMauPerMonth": 10000, "maxApiCallsPerDay": 50000, ... },
    "usage":  { "mauThisMonth": 3241, "apiCallsToday": 1820, ... }
  }
}
```

---

## 9. Error reference

All errors follow the same envelope:

```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_ERROR",
    "message": "Invalid organization secret",
    "details": []
  },
  "meta": { "requestId": "abc-123", "timestamp": "..." }
}
```

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing or invalid request fields |
| 401 | `AUTHENTICATION_ERROR` | Bad org secret, bad API key, or invalid token |
| 403 | `AUTHORIZATION_ERROR` | Valid identity but insufficient permissions |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate resource (e.g. email already registered) |
| 423 | `ACCOUNT_LOCKED` | Too many failed login attempts |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded |
| 429 | `PLAN_LIMIT_EXCEEDED` | Org plan quota reached |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## 10. Quick-start examples

### Node.js — register a user and check a permission

```js
const AUTHY_BASE = "https://your-authy-instance.com/api/v1";
const ORG_SECRET = process.env.AUTHY_ORG_SECRET;
const API_KEY    = process.env.AUTHY_API_KEY;

async function registerUser(email, password, firstName) {
  const res = await fetch(`${AUTHY_BASE}/org-api/register`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ORG_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, firstName, mode: "full" }),
  });
  const { data } = await res.json();
  return data.user;
}

async function canExportReports(userToken) {
  const res = await fetch(`${AUTHY_BASE}/check`, {
    method: "POST",
    headers: {
      "X-Authy-Key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: userToken, feature: "reports:export" }),
  });
  const { data } = await res.json();
  return data.allowed;
}
```

### Python — register a user

```python
import os
import requests

AUTHY_BASE = "https://your-authy-instance.com/api/v1"
ORG_SECRET = os.environ["AUTHY_ORG_SECRET"]

def register_user(email: str, password: str, first_name: str) -> dict:
    response = requests.post(
        f"{AUTHY_BASE}/org-api/register",
        headers={"Authorization": f"Bearer {ORG_SECRET}"},
        json={"email": email, "password": password, "firstName": first_name, "mode": "full"},
    )
    response.raise_for_status()
    return response.json()["data"]["user"]

def check_permission(api_key: str, user_token: str, feature: str) -> bool:
    response = requests.post(
        f"{AUTHY_BASE}/check",
        headers={"X-Authy-Key": api_key},
        json={"token": user_token, "feature": feature},
    )
    response.raise_for_status()
    return response.json()["data"]["allowed"]
```

### Webhook handler — Next.js App Router

```ts
// app/api/webhooks/authy/route.ts
import { NextRequest } from "next/server";
import crypto from "crypto";

const WEBHOOK_SECRET = process.env.AUTHY_WEBHOOK_SECRET!;

function verify(body: string, signature: string): boolean {
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get("x-authy-signature") ?? "";

  if (!verify(body, sig)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(body);

  switch (event.event) {
    case "USER_CREATED":
      await syncUserToDatabase(event.data);
      break;
    case "USER_LOGIN":
      await recordLoginEvent(event.data);
      break;
  }

  return new Response("OK");
}
```

### PKCE OAuth flow — full Node.js example

```js
const crypto = require("crypto");
const express = require("express");
const app = express();

const AUTHY_BASE = "https://your-authy-instance.com/api/v1";
const CLIENT_ID  = process.env.AUTHY_CLIENT_ID;
const REDIRECT   = "http://localhost:3000/auth/callback";

// In-memory session store (use a real session in production)
const sessions = {};

// Step 1: Redirect user to Authy
app.get("/auth/login", (req, res) => {
  const verifier  = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state     = crypto.randomBytes(16).toString("hex");

  sessions[state] = { verifier };

  const params = new URLSearchParams({
    response_type:         "code",
    client_id:             CLIENT_ID,
    redirect_uri:          REDIRECT,
    code_challenge:        challenge,
    code_challenge_method: "S256",
    scope:                 "openid profile email",
    state,
  });

  res.redirect(`${AUTHY_BASE}/oauth/authorize?${params}`);
});

// Step 2: Handle callback and exchange code
app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  const { verifier } = sessions[state] ?? {};
  if (!verifier) return res.status(400).send("Invalid state");

  const tokenRes = await fetch(`${AUTHY_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      code_verifier: verifier,
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT,
    }),
  });

  const { access_token, refresh_token } = await tokenRes.json();

  // Store tokens in session, set cookie, etc.
  res.json({ access_token });
});
```

---

## Need help?

- **Dashboard** — manage keys, apps, webhooks, and view delivery logs
- **Usage page** — monitor your MAU and API call counts in real time
- **Check Tester** — paste a JWT and feature key to test permissions live in the dashboard
