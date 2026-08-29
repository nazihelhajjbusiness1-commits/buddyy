# Buddyy — Interactive Study Assistant

A NotebookLM-style study assistant. Students upload their material (lectures,
books, articles, homework, exams), chat with a **RAG assistant grounded only in
those sources**, and learn out loud with a **real-time talking avatar** that
lip-syncs answers. Optional **microphone + camera focus monitoring** detects
distraction (including a phone in view) and nudges the student back on track.

> See [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) for the full feature status and
> [`COST_ANALYSIS.md`](./COST_ANALYSIS.md) for the unit economics.

---

## Architecture

```
Frontend (Vite + TypeScript)                Backend (Express + TypeScript)
  index.html  → immersive study app           /api/auth       auth + JWT + refresh rotation
  auth.html   → sign in / register / reset     /api/notebooks  notebooks · sources · chat (SSE)
  src/main.ts → app logic, avatar, focus       /api/anam       ANAM avatar broker
  src/lib/api → typed API client               /api/spatius    Spatius avatar broker
                                               /api/tts        Piper TTS → PCM16
  Vite proxies /api → backend (same origin)   Prisma · SQLite (dev) / Postgres (prod)
```

## Quick start (dev)

```bash
# 1. Backend
cd server
cp .env.example .env         # fill in GEMINI_API_KEY (free) at minimum
npm install
npm run db:push              # creates the SQLite dev.db
npm run dev                  # http://localhost:4000

# 2. Frontend (new terminal, repo root)
npm install
npm run dev                  # http://localhost:5173
```

Test user during development: `student@test.com` / `supersecret123`.
Email verification / password-reset links are printed to the **server console**
unless `RESEND_API_KEY` is set.

## Scripts

| Location | Command | What it does |
|---|---|---|
| root | `npm run dev` / `build` / `typecheck` | Frontend Vite dev / prod build / type-check |
| server | `npm run dev` / `build` / `start` | API in watch mode / compile / run compiled |
| server | `npm test` | Vitest unit tests (auth tokens, chunking, embeddings) |
| server | `npm run db:push` / `db:studio` | Sync Prisma schema / open Prisma Studio |

---

## Configuration

All backend config lives in `server/.env` — see `server/.env.example` for the
annotated list. Groups:

- **Core** — `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `CLIENT_ORIGIN`, `COOKIE_SECURE`, `COOKIE_SAMESITE`
- **AI** — `LLM_PROVIDER` / `EMBEDDING_PROVIDER` (`gemini` default) + provider keys
- **Email** — `RESEND_API_KEY`, `MAIL_FROM` (falls back to console in dev)
- **Storage** — `STORAGE_BACKEND` (`local` | `s3`) + `S3_*`
- **Avatar** — `ANAM_*` and/or `SPATIUS_*`; **TTS** — `PIPER_*`
- **Observability** — `LOG_LEVEL`, optional `SENTRY_DSN`

### Security posture
- Argon2id password hashing; JWT access token (15 min, in memory) + HttpOnly
  refresh cookie with **rotation + reuse detection**.
- In production (`COOKIE_SECURE=true`) the refresh cookie is `Secure` +
  `SameSite=None` so it works across the Vercel/​Render origin split; **CSRF** is
  enforced by an Origin allowlist on the cookie-authenticated routes. HSTS is on.
- Helmet, CORS-with-credentials, per-route rate limiting, Zod validation.

---

## Deployment

Frontend on **Vercel**, API + Postgres on **Render** (see `render.yaml` and
`server/Dockerfile`).

1. Push to GitHub. In Render: **New → Blueprint** → pick this repo. It provisions
   the Dockerized API (`server/`) and a Postgres database, wiring `DATABASE_URL`
   and generating `ACCESS_TOKEN_SECRET`. Fill `CLIENT_ORIGIN`, `GEMINI_API_KEY`,
   `RESEND_API_KEY` in the dashboard.
2. In Vercel: import the repo (root). Edit `vercel.json` → set the `/api` rewrite
   destination to your Render URL so the browser sees one origin.
3. CI (`.github/workflows/ci.yml`) type-checks + builds the frontend and
   type-checks + tests the backend on every push/PR.

> ⚠️ Vercel Hobby forbids commercial use — move to Pro before charging users.
> ⚠️ Render free web services spin down after 15 min idle — use Starter.

### Scaling to Postgres + pgvector
1. In `server/prisma/schema.prisma` set `provider = "postgresql"`, set a Postgres
   `DATABASE_URL`, then `npx prisma migrate deploy` (or `db push`). Relational
   data works immediately; retrieval still uses in-app cosine similarity.
2. For ANN vector search at scale: `CREATE EXTENSION vector;`, migrate
   `Chunk.embedding` to a `vector(N)` column via a raw SQL migration (Prisma
   `Unsupported("vector")`), add an `ivfflat`/`hnsw` index, and replace the
   in-memory ranking in `chat.service.ts` with an `ORDER BY embedding <=> $query`
   query. This removes the "load all chunks into memory" step.

### S3 / Cloudflare R2 storage
Set `STORAGE_BACKEND=s3` + `S3_*`. The built-in SigV4 client
(`server/src/lib/s3.ts`) is dependency-free and works with AWS S3, R2, or B2.
No code change to swap in `@aws-sdk/client-s3` later — it sits behind the same
`saveBuffer`/`deleteFile` interface in `storage.ts`.

---

## Roadmap — not yet built (needs your keys or a decision)

These are scaffolded/documented but intentionally not wired, because each needs
a credential, an account, or a product decision:

| Feature | What's needed to finish |
|---|---|
| **Transactional email** in prod | Set `RESEND_API_KEY` + verify a domain (code is done). |
| **Cloud storage** in prod | Create a bucket, set `S3_*` (code is done). |
| **Sentry error tracking** | `npm i @sentry/node` + set `SENTRY_DSN` (shim is done). |
| **Durable ingestion queue** | Stand up Redis, add BullMQ; current code retries in-process. |
| **Billing & plans (Stripe)** | Stripe account + price IDs; meter avatar minutes (see COST_ANALYSIS §10). |
| **2FA (TOTP)** | Product decision + `otplib`; enroll/verify/recovery-codes + login step-up. |
| **OAuth (Google/Microsoft)** | OAuth app credentials + callback routes. |
| **Voice input (STT)** | Whisper/Deepgram key; stream mic → transcript → chat. |
| **Source viewer / citation highlight** | UI work: open a source and highlight the cited passage. |
| **Malware scanning on upload** | ClamAV or a scanning API in the ingestion path. |
| **Self-hosted avatar** | GPU host for Duix/MuseTalk to drop per-minute fees at scale. |

Recently completed (this codebase): multi-notebook UI + switching, persisted
chat-history rendering, lazy-loaded avatarkit, cookie hardening + CSRF, real
email adapter, S3 storage backend, structured logging, ingestion retry, unit
tests + CI, and deployment configs.
