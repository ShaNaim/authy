# Authentication Microservice - Project Overview

## What This Project Is

This is a **production-ready, standalone authentication microservice** built with Node.js, Express, TypeScript, and PostgreSQL. It's designed to be reusable across multiple applications and follows modern security best practices.

## Purpose

The auth service handles all user authentication and authorization needs:

- User registration and login
- JWT-based token management (access + refresh tokens)
- Email verification
- Password reset flows
- Session management
- Role-based access control (RBAC)
- Multi-tenant support (can serve multiple applications)
- Comprehensive audit logging

## Architecture

### Pattern: Layered Architecture

```bash
Routes Layer → Controllers → Services → Repositories → Database
```

**Why not MVC?**

- No views needed (API only)
- Cleaner separation of concerns
- Industry standard for microservices
- Easier to test and maintain

### Tech Stack

**Core:**

- Runtime: Node.js 20+
- Framework: Express.js
- Language: TypeScript (strict mode)
- Database: PostgreSQL
- ORM: Prisma
- Cache: Redis

**Security:**

- JWT tokens (jsonwebtoken)
- Password hashing (bcryptjs)
- Rate limiting (express-rate-limit)
- Security headers (helmet)

**Email:**

- Nodemailer (direct SMTP)
- Will migrate to separate notification service later

**Logging:**

- Application logs: Winston (files)
- Audit logs: Database (queryable)

**Testing:**

- Unit tests: Jest
- Integration tests: Supertest

**Deployment:**

- Docker ready
- docker-compose for local development
- Deployable to any VPS

## Key Features

### 1. Authentication

- Email + password registration
- Login with account lockout protection
- JWT access tokens (15min lifespan)
- JWT refresh tokens (7 days lifespan)
- Token rotation for security
- Multiple device support

### 2. Email Verification

- Token-based verification
- Resend verification email
- 24-hour token expiry
- Restrictions for unverified users

### 3. Password Management

- Forgot password flow
- Secure reset via email token
- Change password (authenticated)
- Password history (prevent reuse)
- Strength validation

### 4. Security

- Rate limiting on all endpoints
- Account lockout after failed attempts
- Suspicious activity detection
- CSRF protection
- XSS protection
- Secure password hashing (bcrypt)

### 5. Session Management

- Track active sessions
- Logout (single device)
- Logout all devices
- Session expiry
- Concurrent session limits

### 6. Multi-Tenant Support

- Service registration
- User-service mapping
- Service-specific metadata
- Cross-service authentication
- Service isolation

### 7. Role-Based Access Control

- User roles (USER, ADMIN, MODERATOR)
- Role assignment
- Protected admin routes
- Permission validation middleware

### 8. Audit Logging

- All security events logged to database
- Login attempts (success/failure)
- Password changes
- Email changes
- Account modifications
- Admin actions
- Queryable for reports and compliance

### 9. Admin Features

- List/search users (paginated)
- Suspend/activate accounts
- Delete users
- View audit logs
- Reset user passwords

### 10. Monitoring

- Health check endpoint
- Request logging with timing
- Error tracking
- Performance metrics

## Project Structure

```bash
auth-service/
├── src/
│   ├── config/           # Environment, database, redis config
│   ├── middleware/       # Auth, validation, rate limiting, error handling
│   ├── routes/          # API route definitions
│   ├── controllers/     # Request/response handling
│   ├── services/        # Business logic
│   ├── repositories/    # Database operations (Prisma)
│   ├── utils/           # JWT, hashing, email, logger utilities
│   ├── types/           # TypeScript type definitions
│   ├── constants/       # Enums and constants
│   ├── app.ts          # Express app setup
│   └── index.ts        # Server entry point
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── migrations/      # Database migrations
├── tests/
│   ├── unit/           # Unit tests
│   └── integration/    # API integration tests
├── logs/               # Application logs
├── .env.example        # Environment variables template
├── Dockerfile          # Docker configuration
├── docker-compose.yml  # Local development setup
├── tsconfig.json       # TypeScript configuration
└── package.json        # Dependencies and scripts
```

## API Endpoints

### Public Routes

```bash
POST   /api/v1/auth/register           - Create new account
POST   /api/v1/auth/login              - Login and get tokens
POST   /api/v1/auth/refresh            - Refresh access token
POST   /api/v1/auth/verify-email       - Verify email with token
POST   /api/v1/auth/resend-verification - Resend verification email
POST   /api/v1/auth/forgot-password    - Request password reset
POST   /api/v1/auth/reset-password     - Reset password with token
GET    /api/v1/health                  - Health check
```

### Protected Routes (Require Authentication)

```bash
GET    /api/v1/auth/me                 - Get current user
PUT    /api/v1/auth/profile            - Update profile
POST   /api/v1/auth/change-password    - Change password
POST   /api/v1/auth/change-email       - Change email
POST   /api/v1/auth/logout             - Logout (revoke refresh token)
POST   /api/v1/auth/logout-all         - Logout all devices
DELETE /api/v1/auth/account            - Delete account
GET    /api/v1/auth/sessions           - List active sessions
```

### Service-to-Service Routes (Internal)

```bash
POST   /api/v1/internal/verify-token   - Validate token from other services
POST   /api/v1/internal/validate-service - Validate service credentials
GET    /api/v1/internal/user/:userId   - Get user data for other services
```

### Admin Routes (Require ADMIN role)

```bash
GET    /api/v1/admin/users             - List all users (paginated)
GET    /api/v1/admin/users/:userId     - Get user details
PUT    /api/v1/admin/users/:userId/suspend - Suspend user account
PUT    /api/v1/admin/users/:userId/activate - Activate user account
DELETE /api/v1/admin/users/:userId     - Delete user
POST   /api/v1/admin/users/:userId/reset-password - Admin password reset
GET    /api/v1/admin/audit-logs        - View audit logs
```

## Database Schema

### Core Tables

- **User** - User accounts with credentials and status
- **RefreshToken** - Active refresh tokens for session management
- **UserService** - Multi-tenant user-service mapping
- **PasswordHistory** - Track password changes
- **Session** - Active user sessions
- **AuditLog** - Security and user action logs
- **Service** - Registered services that can use this auth service

### Main Features

- UUID primary keys
- Cascading deletes where appropriate
- Indexed fields for performance
- JSON fields for flexible metadata
- Timestamp tracking (createdAt, updatedAt)

## Security Design

### JWT Token Strategy

**Two-token system:**

1. **Access Token** (short-lived: 15min)

   - Used for API authentication
   - Contains: userId, email, role
   - Stateless (not stored in DB)
   - Stored in client memory

2. **Refresh Token** (long-lived: 7 days)
   - Used to get new access tokens
   - Stored in database
   - Can be revoked anytime
   - Rotates on each use

**Token Rotation Flow:**

```bash
Access token expires → Client sends refresh token →
Validate refresh token → Generate new access + refresh →
Revoke old refresh token → Return new tokens
```

### Password Security

- Bcrypt hashing (10 rounds)
- Password strength validation
- Password history (prevent reuse)
- Secure reset tokens (expires in 1 hour)

### Account Protection

- Rate limiting on all endpoints
- Account lockout after 5 failed attempts
- 15-minute lockout duration
- IP tracking for suspicious activity

## Logging Strategy

### Two-Layer System

**Layer 1: Application Logs (Winston)**

- File-based logs (error.log, combined.log)
- Console output in development
- Log rotation (14-day retention)
- Levels: error, warn, info, http, debug

**Layer 2: Audit Logs (Database)**

- All security-critical events
- User actions and admin actions
- Queryable for reports
- Permanent record (90-day hot storage)

### What Gets Logged

**Application Logs:**

- All HTTP requests with timing
- Errors with stack traces
- Security warnings
- System events

**Audit Logs:**

- User registration/login/logout
- Password changes/resets
- Email verification
- Account lockouts
- Admin actions
- Token refresh/revocation
- Suspicious activity

**Sensitive Data Handling:**

- ❌ Never log: passwords, tokens, API keys
- ✅ Safe to log: email (masked), token type, actions

### Request Tracing

- Every request gets unique requestId (UUID)
- requestId included in all logs
- Easy to trace single request across all operations

## Development Workflow

### Phase 1: Project Setup

1. Initialize Node.js project
2. Configure TypeScript
3. Install dependencies
4. Create project structure
5. Setup environment configuration

### Phase 2: Database & Infrastructure

1. Define Prisma schema
2. Setup PostgreSQL connection
3. Setup Redis connection
4. Create database migrations
5. Configure logger

### Phase 3: Core Utilities

1. JWT token utilities
2. Password hashing utilities
3. Email service
4. Validation schemas (Zod)
5. Error classes

### Phase 4: Repositories

1. User repository
2. RefreshToken repository
3. AuditLog repository
4. Session repository

### Phase 5: Business Logic (Services)

1. Authentication service
2. Token service
3. Email service
4. User service
5. Audit service

### Phase 6: API Layer

1. Controllers
2. Routes
3. Middleware (auth, validation, rate limiting)
4. Error handling

### Phase 7: Testing

1. Unit tests
2. Integration tests
3. Security testing

### Phase 8: Docker & Deployment

1. Dockerfile
2. docker-compose.yml
3. Production configuration
4. Deploy to VPS

## Environment Variables

Required variables:

- `NODE_ENV` - development/production
- `PORT` - Server port (default: 3001)
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_ACCESS_SECRET` - Secret for access tokens
- `JWT_REFRESH_SECRET` - Secret for refresh tokens
- `SMTP_*` - Email configuration
- `FRONTEND_URL` - Frontend URL for email links
- Security settings (rate limits, bcrypt rounds, etc.)

## Future Enhancements

**Phase 2 Features:**

- OAuth integration (Google, GitHub)
- Two-factor authentication (TOTP)
- Magic link login
- Biometric authentication support

**Migration Path:**

- Currently uses direct email (Nodemailer)
- Will migrate to separate notification service
- Service-to-service communication via HTTP/queue

## Why This Design?

**Modularity:** Each layer has single responsibility

**Type Safety:** TypeScript ensures correctness at compile time

**Security:** Multiple layers of protection (rate limiting, token rotation, audit logs)

**Scalability:** Stateless design, Redis caching, horizontal scaling ready

**Maintainability:** Clear structure, comprehensive logging, well-tested

**Reusability:** Multi-tenant design allows serving multiple apps

**Standards:** Industry-standard patterns and best practices

## Success Criteria

✅ All authentication flows work securely
✅ Comprehensive test coverage (>80%)
✅ All security events logged
✅ API response times < 200ms (95th percentile)
✅ Zero exposed secrets
✅ Docker deployment successful
✅ Documentation complete

## Notes for AI Assistant

- This is a microservice, not a monolith
- Type safety is critical - use TypeScript strictly
- Security is paramount - validate everything
- Log everything security-related
- Write clean, modular code
- Follow the layered architecture pattern
- Test each component thoroughly
- Use Prisma for all database operations
- Never expose sensitive data in logs or responses
- Follow the step-by-step roadmap provided
