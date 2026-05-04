# Authy Auth Service — Test Plan

Full test plan for the Authy authentication microservice. Tests are organized by
category and layer. Each entry shows the test name, what it exercises, and its
expected outcome.

---

## 1. Unit Tests — Utils

### 1.1 `password.utils.test.ts`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | hashPassword returns a string | `hashPassword` return type | Returns non-empty string |
| 2 | hashPassword does not return the original password | Hash ≠ plaintext | Hash is different from input |
| 3 | hashPassword produces different hashes on each call | Bcrypt salt uniqueness | Two hashes of same input differ |
| 4 | hashPassword returns a bcrypt hash (starts with $2) | Bcrypt format | Hash begins with `$2b$` |
| 5 | comparePassword returns true for matching password | `comparePassword` happy path | Returns `true` |
| 6 | comparePassword returns false for wrong password | `comparePassword` mismatch | Returns `false` |
| 7 | comparePassword returns false for empty string | Edge case — empty input | Returns `false` |
| 8 | validatePasswordStrength passes a fully valid password | All rules satisfied | `{ valid: true, errors: [] }` |
| 9 | validatePasswordStrength passes passwords with multiple special chars | Multiple specials | Valid result |
| 10 | fails — password shorter than 8 characters | Min length rule | `valid: false`, min-length error |
| 11 | passes — exactly 8 characters meeting all rules | Min length boundary | `valid: true` |
| 12 | fails — password longer than 128 characters | Max length rule | `valid: false`, max-length error |
| 13 | passes — exactly 128 characters | Max length boundary | `valid: true` |
| 14 | fails — no uppercase letter | Uppercase rule | Error includes "uppercase" |
| 15 | fails — no lowercase letter | Lowercase rule | Error includes "lowercase" |
| 16 | fails — no number | Number rule | Error includes "number" |
| 17 | fails — no special character | Special char rule | Error includes "special character" |
| 18 | reports multiple errors for multiple violations | Multiple rule violations | `errors.length > 1` |

---

### 1.2 `jwt.utils.test.ts`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | generateAccessToken returns a non-empty string | Return type | String with length > 0 |
| 2 | produces a JWT with three dot-separated segments | JWT structure | `token.split('.').length === 3` |
| 3 | encodes userId into the payload | Payload field | `decoded.userId === payload.userId` |
| 4 | encodes email into the payload | Payload field | `decoded.email === payload.email` |
| 5 | encodes role into the payload | Payload field | `decoded.role === payload.role` |
| 6 | encodes type='access' | Token type field | `decoded.type === 'access'` |
| 7 | encodes jti into the payload | JWT ID field | `decoded.jti === payload.jti` |
| 8 | includes exp in the payload | Expiry claim | `decoded.exp` is a number |
| 9 | generateRefreshToken returns a non-empty string | Return type | String with length > 0 |
| 10 | encodes userId, tokenId, type='refresh' | Refresh payload | Fields match input |
| 11 | includes exp in the refresh token | Expiry claim | `decoded.exp` is a number |
| 12 | verifyAccessToken returns correct payload for valid token | Happy path | All fields match original payload |
| 13 | throws AuthenticationError for expired access token | JWT expiry | `AuthenticationError` thrown |
| 14 | throws with 'expired' in message for expired token | Error message | Message matches `/expired/i` |
| 15 | throws AuthenticationError for wrong secret | Signature mismatch | `AuthenticationError` thrown |
| 16 | throws AuthenticationError for completely invalid string | Malformed token | `AuthenticationError` thrown |
| 17 | throws AuthenticationError for empty string | Edge case | `AuthenticationError` thrown |
| 18 | verifyRefreshToken returns correct payload | Happy path | All fields match |
| 19 | throws AuthenticationError for expired refresh token | JWT expiry | `AuthenticationError` thrown |
| 20 | throws for wrong secret on refresh token | Signature mismatch | `AuthenticationError` thrown |
| 21 | throws for access token passed to verifyRefreshToken | Wrong token type | `AuthenticationError` thrown |
| 22 | getTokenRemainingTtl returns positive for future exp | TTL calculation | `ttl > 0` |
| 23 | getTokenRemainingTtl returns 0 for past exp | Expired token TTL | `ttl === 0` |
| 24 | returns approximately correct remaining seconds | TTL accuracy | Within ±1 second |
| 25 | returns 0 (not negative) for past timestamps | No negative TTL | `ttl >= 0` |

---

### 1.3 `token.utils.test.ts`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | generateSecureToken returns a string | Return type | Non-empty string |
| 2 | default output is 64 hex characters (32 bytes) | Default length | `token.length === 64` |
| 3 | returns only hex characters | Hex encoding | Matches `/^[0-9a-f]+$/i` |
| 4 | returns 128 chars for 64 bytes | Custom byte count | Length 128 |
| 5 | returns 16 chars for 8 bytes | Custom byte count | Length 16 |
| 6 | produces different values on each call | Cryptographic randomness | 10 unique tokens from 10 calls |
| 7 | two sequential tokens differ | Uniqueness | `t1 !== t2` |
| 8 | hashToken returns a string | Return type | Non-empty string |
| 9 | returns a 64-character SHA-256 hex string | Hash length | `hash.length === 64` |
| 10 | returns only hex characters | Hex encoding | Matches `/^[0-9a-f]+$/i` |
| 11 | same input produces same hash (deterministic) | Determinism | `hashToken(x) === hashToken(x)` |
| 12 | different inputs produce different hashes | Collision resistance | `hashToken(a) !== hashToken(b)` |
| 13 | sensitive to a single character change | Avalanche effect | Hashes differ |
| 14 | hashes empty string without throwing | Edge case | Returns 64-char hex string |
| 15 | produces known SHA-256 hash of 'abc' | Known-answer test | Matches expected hex value |
| 16 | generateExpiryDate returns a Date | Return type | `instanceof Date` |
| 17 | returns future date for positive ms | Expiry direction | `date > now` |
| 18 | returns past date for negative ms | Negative offset | `date < now` |
| 19 | date is approximately 1 hour ahead for 3600000 ms | Accuracy | Within ±50ms of expected |
| 20 | returns now for 0 ms | Zero offset | Within ±10ms of `Date.now()` |
| 21 | isExpired returns true for past date | Expiry check | `true` |
| 22 | isExpired returns false for future date | Non-expired check | `false` |
| 23 | returns true for date far in the past | Historical date | `true` |
| 24 | returns false for date far in the future | Future date | `false` |
| 25 | works with generateExpiryDate future output | Integration | `isExpired(future) === false` |
| 26 | works with generateExpiryDate past output | Integration | `isExpired(past) === true` |

---

### 1.4 `validation.schemas.test.ts`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | registerSchema passes valid email + strong password | Happy path | `success: true` |
| 2 | normalises email to lowercase | Email transform | `email === 'user@example.com'` |
| 3 | trims whitespace from email | Email transform | Leading/trailing spaces removed |
| 4 | fails with invalid email | Email validation | `success: false` |
| 5 | fails when email is missing | Required field | `success: false` |
| 6 | fails when password is missing | Required field | `success: false` |
| 7 | fails — password missing uppercase | Uppercase regex | Error includes "uppercase" |
| 8 | fails — password missing lowercase | Lowercase regex | Error includes "lowercase" |
| 9 | fails — password missing number | Digit regex | Error includes "number" |
| 10 | fails — password missing special char | Special char regex | Error includes "special character" |
| 11 | fails — password too short | Min length | Error includes "at least" |
| 12 | fails — password too long (>128) | Max length | Error includes "at most" |
| 13 | loginSchema passes valid email + any non-empty password | Happy path | `success: true` |
| 14 | loginSchema normalises email | Email transform | Lowercase email |
| 15 | loginSchema fails with invalid email | Email validation | `success: false` |
| 16 | loginSchema fails with empty password | Required field | `success: false` |
| 17 | loginSchema accepts weak password (only checks non-empty) | Login leniency | `success: true` for "weak" |
| 18 | resetPasswordSchema passes with token + strong password | Happy path | `success: true` |
| 19 | resetPasswordSchema fails when token is missing | Required field | `success: false` |
| 20 | resetPasswordSchema fails when token is empty | Min length | `success: false` |
| 21 | resetPasswordSchema fails when newPassword is weak | Password rules | `success: false` |
| 22 | changePasswordSchema passes with both fields | Happy path | `success: true` |
| 23 | changePasswordSchema fails when currentPassword is missing | Required field | `success: false` |
| 24 | changePasswordSchema fails when newPassword is missing | Required field | `success: false` |
| 25 | paginationSchema defaults to page=1, limit=20 | Default values | `{page:1, limit:20}` |
| 26 | paginationSchema coerces string page to number | Coerce transform | `page === 2` for `"2"` |
| 27 | paginationSchema coerces string limit to number | Coerce transform | `limit === 50` for `"50"` |
| 28 | paginationSchema rejects page=0 | Min value | `success: false` |
| 29 | paginationSchema rejects negative page | Min value | `success: false` |
| 30 | paginationSchema rejects limit > 100 | Max value | `success: false` |
| 31 | paginationSchema accepts limit=100 (boundary) | Boundary check | `success: true` |

---

### 1.5 `errors.test.ts`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | AppError is an instance of Error | Inheritance | `instanceof Error` |
| 2 | AppError has correct message | Message field | `err.message === 'Something went wrong'` |
| 3 | AppError has correct statusCode | Status code | `err.statusCode === 500` |
| 4 | AppError has correct errorCode | Error code | `err.errorCode === 'INTERNAL_ERROR'` |
| 5 | AppError has isOperational=true | Operational flag | `err.isOperational === true` |
| 6 | AppError stores details | Details field | `err.details` equals provided object |
| 7 | AppError has a stack trace | Stack trace | `err.stack` is defined |
| 8 | ValidationError has statusCode 400 | HTTP status | `statusCode === 400` |
| 9 | ValidationError has errorCode VALIDATION_ERROR | Error code | Correct constant |
| 10 | AuthenticationError has statusCode 401 | HTTP status | `statusCode === 401` |
| 11 | AuthenticationError uses default message | Default value | `'Authentication required'` |
| 12 | AuthenticationError accepts custom message | Custom message | `'Token has expired'` |
| 13 | AuthorizationError has statusCode 403 | HTTP status | `statusCode === 403` |
| 14 | AuthorizationError default message | Default value | `'Insufficient permissions'` |
| 15 | NotFoundError has statusCode 404 | HTTP status | `statusCode === 404` |
| 16 | NotFoundError default message | Default value | `'Resource not found'` |
| 17 | ConflictError has statusCode 409 | HTTP status | `statusCode === 409` |
| 18 | ConflictError errorCode CONFLICT_ERROR | Error code | Correct constant |
| 19 | TooManyRequestsError has statusCode 429 | HTTP status | `statusCode === 429` |
| 20 | TooManyRequestsError errorCode RATE_LIMIT_ERROR | Error code | Correct constant |
| 21 | AccountLockedError has statusCode 429 | HTTP status | `statusCode === 429` |
| 22 | AccountLockedError stores lockedUntil | Locked date | `err.lockedUntil` equals input |
| 23 | AccountLockedError message includes 'locked' | Message content | Contains "locked" |
| 24 | AccountLockedError message includes minutes | Minutes in message | Matches `/\d+ minute/` |
| 25 | AccountLockedError rounds up partial minutes (ceil) | Ceil behaviour | 90s → "2 minute(s)" |
| 26 | DatabaseError has statusCode 500 | HTTP status | `statusCode === 500` |
| 27 | DatabaseError default message | Default value | `'A database error occurred'` |
| 28 | All error classes extend AppError | Inheritance chain | `instanceof AppError === true` |
| 29 | All error classes extend Error | Inheritance chain | `instanceof Error === true` |
| 30 | All error classes have isOperational=true | Operational flag | `true` for all |

---

## 2. Unit Tests — Services (to be implemented)

### 2.1 `auth.service.test.ts`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | register creates user and returns user + message | Happy path | User object without passwordHash |
| 2 | register throws ConflictError if email exists | Duplicate email | `ConflictError` with 409 |
| 3 | register throws ValidationError for weak password | Password strength | `ValidationError` with details |
| 4 | register queues verification email | Email queue | `enqueueEmail` called once |
| 5 | register saves password to history | Password history | `addPasswordHistory` called |
| 6 | login returns user + tokens on success | Happy path | `{ user, tokens }` |
| 7 | login throws AuthenticationError for unknown email | User not found | `AuthenticationError` |
| 8 | login throws AuthenticationError for inactive user | isActive=false | `AuthenticationError` |
| 9 | login throws AccountLockedError when locked | lockedUntil in future | `AccountLockedError` |
| 10 | login throws AuthenticationError for wrong password | Bad password | `AuthenticationError` |
| 11 | login increments failed login attempts on bad password | Attempt tracking | `incrementFailedLoginAttempts` called |
| 12 | login locks account after MAX_LOGIN_ATTEMPTS failures | Account lockout | `lockAccount` called, `AccountLockedError` thrown |
| 13 | login throws AuthorizationError for unverified user | Email not verified | `AuthorizationError` |
| 14 | login resets failed attempts on success | Success cleanup | `resetLoginAttempts` called |
| 15 | logout blacklists the access token | Token blacklisting | `blacklistAccessToken` called |
| 16 | logout revokes the refresh token | Refresh revocation | `revokeRefreshToken` called |
| 17 | logoutAll revokes all refresh tokens and sets revocation time | Session invalidation | Both operations called |
| 18 | refreshTokens issues new tokens | Token rotation | New access + refresh tokens |
| 19 | refreshTokens throws for revoked refresh token | Revoked token | `AuthenticationError` |
| 20 | verifyEmail marks user as verified | Email verification | `markEmailVerified` called |
| 21 | verifyEmail returns 'already verified' if already done | Idempotent | Returns generic message |
| 22 | forgotPassword returns generic message for unknown email | Security — no user enumeration | Generic message |
| 23 | resetPassword updates password and revokes all sessions | Password reset flow | Password updated, sessions revoked |
| 24 | resetPassword rejects recently used passwords | Password history | `ValidationError` |
| 25 | changePassword validates current password | Current password check | `AuthenticationError` for mismatch |
| 26 | getMe returns cached user when available | Cache hit | User from cache |
| 27 | getMe fetches from DB and caches on miss | Cache miss | User from DB, cache set |

---

### 2.2 `token.service.test.ts`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | createRefreshToken hashes the token before storing | Security | `hashToken` result used |
| 2 | verifyAndConsumeRefreshToken verifies JWT signature | JWT verification | `verifyRefreshToken` called |
| 3 | verifyAndConsumeRefreshToken throws for revoked token | `isRevoked=true` | `AuthenticationError` |
| 4 | verifyAndConsumeRefreshToken throws for expired stored token | `expiresAt < now` | `AuthenticationError` |
| 5 | verifyAndConsumeRefreshToken rotates the token | Token rotation | `revokeRefreshToken` called |
| 6 | createEmailVerificationToken generates and stores hash | Email flow | Hex token returned |
| 7 | consumeEmailVerificationToken throws for used token | `isUsed=true` | `AuthenticationError` |
| 8 | consumeEmailVerificationToken throws for expired token | `expiresAt < now` | `AuthenticationError` |
| 9 | blacklistAccessToken sets Redis key with TTL | Token blacklist | `setWithExpiry` called |
| 10 | isAccessTokenRevoked returns true when JTI is blacklisted | Blacklist check | `true` |
| 11 | isAccessTokenRevoked returns true when iat < revokeBefore | Global revocation | `true` |

---

### 2.3 `cache.service.test.ts`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | setUser serializes data and calls setWithExpiry | Cache write | `JSON.stringify` used |
| 2 | getUser parses cached JSON | Cache read | Parsed object returned |
| 3 | getUser returns null on cache miss | Cache miss | `null` returned |
| 4 | invalidateUser calls del with correct key | Cache invalidation | `del` called |
| 5 | blacklistAccessToken sets key with ttl | Blacklist write | `setWithExpiry` called |
| 6 | isAccessTokenBlacklisted returns true when key exists | Blacklist check | `true` |
| 7 | setUserRevocationTime stores timestamp as string | Revocation write | `setWithExpiry` called |
| 8 | getUserRevocationTime parses stored timestamp | Revocation read | Number returned |
| 9 | getUserRevocationTime returns null on miss | Cache miss | `null` |

---

## 3. Unit Tests — Middleware (to be implemented)

### 3.1 `auth.middleware.test.ts`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | authenticate calls next(AuthenticationError) with no header | Missing auth | Error passed to next |
| 2 | authenticate calls next(AuthenticationError) for non-Bearer | Wrong scheme | Error passed to next |
| 3 | authenticate calls next(AuthenticationError) for invalid token | Bad JWT | Error passed to next |
| 4 | authenticate calls next(AuthenticationError) for revoked token | Revoked JTI | Error passed to next |
| 5 | authenticate sets req.user and calls next() for valid token | Happy path | `req.user` populated |
| 6 | requireRole calls next() when user has the required role | Authorised | `next()` called |
| 7 | requireRole calls next(AuthorizationError) for wrong role | Unauthorized | Error passed to next |
| 8 | requireRole calls next(AuthenticationError) when no req.user | No auth | Error passed to next |
| 9 | requireAdmin allows ADMIN role only | Admin guard | next() for ADMIN, error for USER |
| 10 | requireAdminOrModerator allows both roles | Multi-role guard | next() for ADMIN and MODERATOR |

---

### 3.2 `validation.middleware.test.ts`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | validate calls next() for valid request body | Schema passes | `next()` called, body mutated |
| 2 | validate calls next(ValidationError) for invalid body | Schema fails | `ValidationError` passed to next |
| 3 | validate passes parsed/transformed data back to req.body | Data transform | `req.body` contains Zod output |

---

### 3.3 `error.middleware.test.ts`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | errorHandler sends correct statusCode for AppError | HTTP mapping | Response status matches error |
| 2 | errorHandler sends 500 for unexpected Error | Unknown error | Status 500 |
| 3 | errorHandler includes errorCode in response body | Error body | `body.errorCode` present |
| 4 | errorHandler includes success=false | Response format | `body.success === false` |
| 5 | notFoundHandler returns 404 | Not found route | Status 404 |

---

### 3.4 `rate-limit.middleware.test.ts`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | globalRateLimiter is exported and is a function | Export check | `typeof fn === 'function'` |
| 2 | authRateLimiter exists and is a function | Export check | `typeof fn === 'function'` |
| 3 | resendRateLimiter exists and is a function | Export check | `typeof fn === 'function'` |

---

## 4. Integration Tests — Public Auth Endpoints

### 4.1 `POST /api/v1/auth/register`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 201 on valid registration | Full happy path | `{success:true, data:{user, message}}` |
| 2 | User object returned without passwordHash | Data sanitization | `data.user.passwordHash === undefined` |
| 3 | 409 when email already exists | Duplicate detection | `{success:false}` with status 409 |
| 4 | 400 for invalid email | Input validation | Status 400 |
| 5 | 400 for password missing uppercase | Weak password | Status 400 |
| 6 | 400 for password missing lowercase | Weak password | Status 400 |
| 7 | 400 for password missing number | Weak password | Status 400 |
| 8 | 400 for password missing special char | Weak password | Status 400 |
| 9 | 400 when email field missing | Required field | Status 400 |
| 10 | 400 when password field missing | Required field | Status 400 |

---

### 4.2 `POST /api/v1/auth/login`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 200 with tokens on valid credentials | Full happy path | `{tokens:{accessToken,refreshToken}, user}` |
| 2 | passwordHash not exposed in response | Data sanitization | `data.user.passwordHash === undefined` |
| 3 | 401 for unknown email | User not found | Status 401 |
| 4 | 401 for wrong password | Bad credentials | Status 401 |
| 5 | 403 for unverified account | Email not verified | Status 403 |
| 6 | 401 for inactive account | Account disabled | Status 401 |
| 7 | 429 for locked account | Account lockout | Status 429 |
| 8 | 400 for invalid email | Input validation | Status 400 |
| 9 | 400 for empty password | Input validation | Status 400 |

---

### 4.3 `POST /api/v1/auth/refresh`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 400 when refreshToken missing | Schema validation | Status 400 |
| 2 | 400 when refreshToken is empty string | Schema validation | Status 400 |
| 3 | 401 for invalid (non-JWT) token | JWT verification | Status 401 |
| 4 | 401 when token not in database | DB lookup fails | Status 401 |
| 5 | 200 with new tokens for valid, stored, non-expired token | Full happy path | New access + refresh tokens |

---

### 4.4 `GET /api/v1/auth/verify-email`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 400 when token query param is missing | Input validation | Status 400 |
| 2 | 401 when token not found in DB | DB lookup | Status 401 |
| 3 | 401 when token already used | `isUsed=true` | Status 401 |
| 4 | 401 when token expired | `expiresAt < now` | Status 401 |
| 5 | 200 for valid, unused, non-expired token | Happy path | `{success:true}` |

---

### 4.5 `POST /api/v1/auth/resend-verification`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 200 generic message when email not found | No user enumeration | Status 200 |
| 2 | 200 generic message when email found and unverified | Happy path | Status 200 |
| 3 | 200 generic message when user already verified | Idempotent | Status 200 |
| 4 | 400 for invalid email | Input validation | Status 400 |

---

### 4.6 `POST /api/v1/auth/forgot-password`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 200 generic message when email not found | No user enumeration | Status 200 |
| 2 | 200 generic message when email found | Happy path | Status 200 |
| 3 | 400 for invalid email | Input validation | Status 400 |

---

### 4.7 `POST /api/v1/auth/reset-password`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 400 when token is missing | Schema validation | Status 400 |
| 2 | 400 when newPassword is weak | Password rules | Status 400 |
| 3 | 401 when reset token not in DB | DB lookup | Status 401 |
| 4 | 401 when reset token is expired | `expiresAt < now` | Status 401 |
| 5 | 400 when new password was recently used | Password history | Status 400 |
| 6 | 200 on successful password reset | Happy path | `{success:true, message}` |

---

## 5. Integration Tests — Protected Auth Endpoints

### 5.1 `GET /api/v1/auth/me`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 401 when no Authorization header | Missing auth | Status 401 |
| 2 | 401 when wrong auth scheme (not Bearer) | Format check | Status 401 |
| 3 | 401 for invalid JWT | Bad token | Status 401 |
| 4 | 401 for expired JWT | Expired token | Status 401 |
| 5 | 401 for revoked JTI | Blacklisted token | Status 401 |
| 6 | 200 with user data for valid token | Happy path | `{success:true, data:{user}}` |
| 7 | passwordHash not exposed | Data sanitization | `data.user.passwordHash === undefined` |

---

### 5.2 `POST /api/v1/auth/logout`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 401 without Authorization header | Auth guard | Status 401 |
| 2 | 400 when refreshToken body is missing | Validation | Status 400 |
| 3 | 200 on successful logout | Happy path | `{success:true}` |
| 4 | Access token is blacklisted after logout | Token invalidation | Redis blacklist updated |

---

### 5.3 `POST /api/v1/auth/logout-all`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 401 without Authorization header | Auth guard | Status 401 |
| 2 | 200 on success | Happy path | `{success:true}` |
| 3 | All refresh tokens revoked | Session invalidation | `revokeAllUserRefreshTokens` called |
| 4 | Revocation timestamp set in Redis | Global revocation | `setUserRevocationTime` called |

---

### 5.4 `PUT /api/v1/auth/change-password`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 401 without Authorization header | Auth guard | Status 401 |
| 2 | 400 when currentPassword is missing | Schema validation | Status 400 |
| 3 | 400 when newPassword is weak | Password rules | Status 400 |
| 4 | 401 when currentPassword is incorrect | Wrong password | Status 401 |
| 5 | 400 when newPassword was recently used | Password history | Status 400 |
| 6 | 200 on success | Happy path | `{success:true, message}` |

---

## 6. Integration Tests — Admin Endpoints

### 6.1 `GET /api/v1/admin/users`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 401 without auth | Auth guard | Status 401 |
| 2 | 403 when authenticated as USER role | Role guard | Status 403 |
| 3 | 200 with paginated user list for ADMIN | Happy path | `{users:[], total, page, limit}` |
| 4 | Pagination defaults (page=1, limit=20) | Default params | Correct pagination |
| 5 | Accepts role and isActive filter params | Filtering | Filtered results |

---

### 6.2 `GET /api/v1/admin/users/:id`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 403 for USER role | Role guard | Status 403 |
| 2 | 404 when user not found | User lookup | Status 404 |
| 3 | 200 with user data for ADMIN | Happy path | User object |

---

### 6.3 `POST /api/v1/admin/users/:id/suspend`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 403 for USER role | Role guard | Status 403 |
| 2 | 404 when user not found | User lookup | Status 404 |
| 3 | 400 when admin tries to suspend themselves | Self-action guard | Status 400 |
| 4 | 200 on success — user isActive=false | Suspension | User returned with isActive=false |

---

### 6.4 `POST /api/v1/admin/users/:id/activate`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 403 for USER role | Role guard | Status 403 |
| 2 | 200 on success — user isActive=true | Activation | User returned with isActive=true |

---

### 6.5 `DELETE /api/v1/admin/users/:id`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 403 for USER role | Role guard | Status 403 |
| 2 | 400 when admin tries to delete themselves | Self-action guard | Status 400 |
| 3 | 404 when user not found | User lookup | Status 404 |
| 4 | 204 on success | Happy path | Status 204 |

---

### 6.6 `GET /api/v1/admin/audit-logs`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 403 for USER role | Role guard | Status 403 |
| 2 | 200 with paginated logs for ADMIN | Happy path | `{logs:[], total}` |
| 3 | Accepts userId, action, from, to filters | Filtering | Filtered audit logs |

---

## 7. Integration Tests — Internal S2S Endpoints

### 7.1 `POST /api/v1/internal/verify-token`

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | 401 when X-Internal-API-Key header is missing | API key guard | Status 401 |
| 2 | 401 when X-Internal-API-Key is wrong | Bad API key | Status 401 |
| 3 | 400 when accessToken is missing from body | Validation | Status 400 |
| 4 | 200 with user data for a valid access token | Happy path | User object |
| 5 | 200 with null/empty for an invalid token | Invalid token | `{user: null}` |
| 6 | 200 with null when token is revoked | Revoked token | `{user: null}` |

---

## 8. Integration Tests — Health Endpoints

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | GET /health returns 200 | Liveness | Status 200 |
| 2 | GET /health body contains status='ok' | Response body | `body.status === 'ok'` |
| 3 | GET /health body contains service name | Service ID | `body.service === 'auth-service'` |
| 4 | GET /health body contains ISO timestamp | Timestamp | Valid ISO string |
| 5 | GET /health/ready returns 200 when DB+Redis ok | Readiness | Status 200, `status:'ready'` |
| 6 | GET /health/ready checks.database='ok' | DB health | `checks.database === 'ok'` |
| 7 | GET /health/ready checks.redis='ok' | Redis health | `checks.redis === 'ok'` |
| 8 | GET /health/ready returns 503 when DB unhealthy | DB down | `status:'degraded'`, checks.database='error' |
| 9 | GET /health/ready returns 503 when Redis unhealthy | Redis down | `status:'degraded'`, checks.redis='error'` |

---

## 9. E2E Tests — Full Flows

### 9.1 Registration Flow

| # | Step | What it tests | Expected outcome |
|---|------|---------------|-----------------|
| 1 | POST /register with valid data | Account creation | 201, user created |
| 2 | GET /verify-email with emailed token | Email verification | 200, isVerified=true |
| 3 | POST /login with new credentials | First login | 200, tokens returned |
| 4 | GET /me with access token | Authenticated session | 200, correct user |

---

### 9.2 Login / Session Flow

| # | Step | What it tests | Expected outcome |
|---|------|---------------|-----------------|
| 1 | POST /login → receive tokens | Authentication | 200, access+refresh tokens |
| 2 | GET /me with access token | Protected resource access | 200, user data |
| 3 | POST /refresh with refresh token | Token rotation | 200, new tokens |
| 4 | GET /me with new access token | New token works | 200, user data |
| 5 | POST /logout with current tokens | Session termination | 200 |
| 6 | GET /me with old access token after logout | Revocation check | 401 (blacklisted) |
| 7 | POST /refresh with old refresh token after logout | Revocation check | 401 |

---

### 9.3 Password Reset Flow

| # | Step | What it tests | Expected outcome |
|---|------|---------------|-----------------|
| 1 | POST /forgot-password with valid email | Reset initiation | 200, generic message |
| 2 | POST /reset-password with emailed token + new password | Reset completion | 200, success message |
| 3 | POST /login with old password | Old password revoked | 401 |
| 4 | POST /login with new password | New credentials work | 200, tokens |
| 5 | Use pre-reset refresh token after reset | Session revocation | 401 |

---

### 9.4 Change Password Flow

| # | Step | What it tests | Expected outcome |
|---|------|---------------|-----------------|
| 1 | POST /login → get access token | Auth | 200 |
| 2 | PUT /change-password with correct current + strong new | Change | 200 |
| 3 | POST /login with old password | Old creds revoked | 401 |
| 4 | POST /login with new password | New creds work | 200 |
| 5 | PUT /change-password with the same recent password | History check | 400 |

---

## 10. Security Tests

| # | Test name | What it tests | Expected outcome |
|---|-----------|---------------|-----------------|
| 1 | Auth endpoints respect rate limiting | Rate limit middleware | 429 after N requests |
| 2 | JWT signed with wrong algorithm is rejected | Algorithm confusion | 401 |
| 3 | Access token is rejected on refresh endpoint | Token type mismatch | 401 |
| 4 | Refresh token is rejected on /me endpoint | Token type mismatch | 401 |
| 5 | SQL injection in email field is sanitized | Input safety | 400 or 0 results |
| 6 | Extremely long request body is rejected | Payload limit (10kb) | 413 |
| 7 | Helmet security headers are present | HTTP hardening | CSP, X-Frame-Options, etc. |
| 8 | CORS blocks requests from unknown origins (production) | CORS policy | 403 or CORS error |
| 9 | PasswordHash never appears in any API response | Data leakage | `passwordHash` absent |
| 10 | Internal endpoint rejects public JWT in API-key header | Header misuse | 401 |
| 11 | Account lockout prevents brute-force after N attempts | Lockout policy | 429 after limit |
| 12 | Password history prevents re-use of last N passwords | Password policy | 400 for recent password |
| 13 | Expired email verification token is rejected | Token expiry | 401 |
| 14 | Expired password reset token is rejected | Token expiry | 401 |
| 15 | Verification token is one-time-use (replay rejected) | Token replay | 401 on second use |
| 16 | Reset token is one-time-use (replay rejected) | Token replay | 401 on second use |
