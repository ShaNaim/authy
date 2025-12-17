# Auth Service

Production-ready authentication microservice.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Setup environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Generate JWT secrets

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output to `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in `.env` (run twice for two different secrets).

---

## Development Setup

### Option 1: Local PostgreSQL & Redis (Fastest)

Make sure PostgreSQL and Redis are running locally, then:

```bash
# Run migrations
npm run prisma:migrate

# Start dev server
npm run dev
```

### Option 2: Docker Databases + Local App

```bash
# Start databases in Docker
docker-compose up -d postgres redis

# Update .env:
# DATABASE_URL=postgresql://authuser:authpass@localhost:5432/auth_db
# REDIS_HOST=localhost

# Run migrations
npm run prisma:migrate

# Start dev server
npm run dev
```

---

## Production (Full Docker)

```bash
# Build and start everything
npm run docker:build
npm run docker:up

# View logs
npm run docker:logs

# Stop
npm run docker:down
```

---

## Scripts

- `npm run dev` - Development mode
- `npm run build` - Build for production
- `npm start` - Run production build
- `npm run docker:up` - Start Docker containers
- `npm run docker:down` - Stop Docker containers
