## Prerequisites

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

## Docker Deployment

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

## Testing

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
