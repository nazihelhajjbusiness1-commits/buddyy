# Buddyy — Interactive Study Assistant · Project Status & Roadmap

_Last updated: 2026-08-24_

Buddyy is a NotebookLM-style study assistant: students upload their material
(lectures, books, articles, homework, exams), chat with a Retrieval-Augmented
(RAG) assistant grounded **only** in those sources, and learn out loud with a
**real-time talking avatar** that lip-syncs the answers. Optional **microphone
and camera focus monitoring** watches whether the student is studying or
distracted (including detecting a phone in view) and nudges them back on track.

---

## 1. Architecture

```
┌────────────────────────────── Frontend (Vite + TypeScript) ──────────────────────────────┐
│  index.html  → immersive app: centered avatar tile, glass overlays, Sources drawer,       │
│                transcript, prompt bar, mic/cam/voice controls, focus monitor              │
│  auth.html   → sign in / register / forgot / reset / verify                               │
│  src/main.ts → auth guard, notebooks, sources+upload+polling, streaming chat,             │
│                avatar (ANAM | Spatius), focus monitoring (audio + motion + phone ML)       │
│  src/lib/api.ts → typed API client (auth, notebooks, sources, SSE chat, avatar, TTS)      │
│  Vite dev proxies /api → backend (same-origin cookies)                                    │
└───────────────────────────────────────────────────────────────────────────────────────────┘
                                          │  /api/*
┌────────────────────────────── Backend (Express + TypeScript) ────────────────────────────┐
│  Auth        → register, verify email, login, JWT access+refresh (rotation + reuse        │
│                detection), logout, forgot/reset, /me, RBAC, rate limiting, Argon2id        │
│  RAG         → notebooks CRUD · upload → extract → chunk → embed → store · chat            │
│                (non-streaming + SSE streaming) with citations                             │
│  Providers   → LLM: Claude | Gemini | Ollama | dev · Embeddings: Voyage | Gemini | Ollama │
│  Avatar      → ANAM broker · Spatius broker (server-side session tokens)                   │
│  TTS         → Piper (self-hosted) → PCM16 for Spatius                                     │
│  Data        → Prisma + SQLite · local-disk file storage                                  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. What's Done ✅

### Authentication & security
| Feature | Status |
|---|---|
| Email + password sign up, email verification (single-use, expiring token) | ✅ |
| Login, logout, "forgot / reset password" (neutral responses) | ✅ |
| Password hashing with **Argon2id** | ✅ |
| JWT **access token** (15m, in memory) + **refresh token** (HttpOnly cookie) | ✅ |
| Refresh-token **rotation + reuse detection** (family revocation) | ✅ |
| Rate limiting (global + strict on auth), Helmet, CORS, Zod validation | ✅ |
| RBAC scaffolding (`requireRole`) | ✅ |
| Same-origin cookie via Vite proxy (fixes Brave/Safari cross-site blocking) | ✅ |

### Documents & RAG core
| Feature | Status |
|---|---|
| Notebook model + CRUD, per-user ownership checks | ✅ |
| File upload (multipart), size/type limits | ✅ |
| Text extraction: **PDF (`unpdf`)**, **DOCX (`mammoth`)**, TXT/MD | ✅ |
| Chunking + embeddings + vector store (JSON in SQLite) | ✅ |
| **Async ingestion** (upload returns instantly) + status polling | ✅ |
| Retrieval (cosine similarity) → grounded answer **with citations** | ✅ |
| **SSE streaming chat** (token-by-token) | ✅ |
| Provider abstraction — LLM: Claude / Gemini / Ollama / dev; Embeddings: Voyage / Gemini / Ollama / dev | ✅ |

### AI providers (current defaults)
| Role | Provider | Model |
|---|---|---|
| Chat | **Google Gemini** (free tier) | `gemini-flash-lite-latest` (~1.2s latency) |
| Embeddings | **Google Gemini** | `gemini-embedding-001` (3072-dim) |
| Local free fallback | **Ollama** (installed) | `llama3.2` + `nomic-embed-text` |

### Real-time avatar
| Feature | Status |
|---|---|
| **ANAM** integration: server session-token broker + client SDK (`@anam-ai/js-sdk`), streaming answer to avatar | ✅ working (Mateo) |
| **Spatius** integration: broker + `@spatius/avatarkit` client + **Piper TTS** (`text → PCM16 → avatar`) | ⚙️ **wired, needs keys/Piper install to run** |
| Provider auto-select (Spatius if configured → ANAM → animated orb) | ✅ |
| On-screen connect button, graceful fallback + error surfacing | ✅ |

### Focus monitoring (mic + camera)
| Feature | Status |
|---|---|
| Microphone: real Web Audio level meter + noise detection | ✅ |
| Camera: real self-view + in-browser **motion detection** (away/present) | ✅ |
| **Phone-in-view detection** via TensorFlow.js **COCO-SSD** (lazy-loaded) | ✅ |
| Combined **focus score** + labels + meter; spoken **nudges** when distracted | ✅ |
| 100% client-side (no audio/video leaves the browser) | ✅ |

### UI/UX
- Immersive video-call layout: centered avatar tile, glassmorphism overlays, Sources slide-in drawer, bottom prompt + call controls.
- Light theme; premium auth screen (password show/hide, strength meter, accessibility: labels, focus rings, `role="alert"`).
- Streaming answers render live; citations shown as chips.

### Verified during development
- All TypeScript type-checks (`strict`) and production builds pass (frontend + backend).
- Auth flows, refresh rotation + reuse detection, CORS-with-credentials — tested live.
- RAG upload → ready → grounded answer + citations — tested live (Gemini + Ollama).
- ANAM session-token broker mints a real token — tested live.
- Spatius / Piper endpoints boot and fail gracefully (503) until configured.

---

## 3. Tech Stack

- **Frontend:** Vite, TypeScript (strict), Tailwind (CDN), Lucide icons, `@anam-ai/js-sdk`, `@spatius/avatarkit`, `@tensorflow/tfjs` + `@tensorflow-models/coco-ssd`.
- **Backend:** Node/Express, TypeScript, Prisma, SQLite, Zod, Argon2id (`@node-rs/argon2`), `jsonwebtoken`, Multer, `unpdf`, `mammoth`, `@anthropic-ai/sdk`.
- **AI:** Google Gemini (chat + embeddings), Ollama (local), Claude/Voyage (optional).
- **Avatar/voice:** ANAM (turnkey) or Spatius + Piper TTS (self-hosted voice).

---

## 4. How to Run (dev)

```bash
# 1. Backend
cd server
npm install
npm run db:push        # creates SQLite dev.db
npm run dev            # http://localhost:4000

# 2. Frontend (separate terminal, project root)
npm install
npm run dev            # http://localhost:5173
```
Config lives in `server/.env` (see `server/.env.example`). Test user during
development: `student@test.com` / `supersecret123`.

---

## 5. Known Limitations / Tech Debt

- **SQLite + in-memory vector search** — fine for dev, not for scale.
- **Ingestion is fire-and-forget** (no durable job queue; a crash loses in-flight work).
- **Local-disk file storage** (not cloud object storage), no malware scanning.
- **No HTTPS / production cookie hardening** (`COOKIE_SECURE=false`, dev secrets).
- **Dev mailer only** — verification/reset links are logged to the server console, not emailed.
- **No 2FA, no OAuth** (planned, not built).
- **Single default notebook** per user (no multi-notebook management UI).
- **Focus detection is heuristic** (motion + audio) plus phone ML; no gaze/posture models.
- **Large frontend bundle** — `@spatius/avatarkit` and TF.js are heavy; avatarkit is currently statically imported.
- **Avatar cost** — ANAM is expensive per minute; Spatius+Piper is cheaper but unproven end-to-end here.
- **No automated tests / CI**.

---

## 6. Recommended Future Work 🚀

### A. Production hardening (do before any real users)
1. **Switch DB to PostgreSQL + `pgvector`** for real vector search (one Prisma provider change + migrate `embedding` to a vector column).
2. **Durable ingestion queue** (BullMQ + Redis) so uploads process reliably and retry on failure.
3. **Cloud object storage** (S3/GCS) via presigned uploads; add **AV/malware scanning** and per-user quotas.
4. **HTTPS + cookie hardening** (`COOKIE_SECURE=true`, `SameSite`, HSTS), real env-secret management, structured logging + error tracking (Sentry).
5. **Real transactional email** (Resend / SES / SMTP) replacing the dev console mailer.

### B. Security / account features
6. **2FA (TOTP)** — enroll/verify/disable + hashed recovery codes + login step-up.
7. **OAuth** (Google / Microsoft) sign-in for students.
8. **CSRF protection** for cookie flows; account lockout / suspicious-login handling.
9. **Audit logging** of auth + admin actions.

### C. Avatar cost & sustainability (key for productization)
10. **Finish + test the Spatius + Piper pipeline** (provide keys, install Piper) — ~12× cheaper than ANAM.
11. **On-demand avatar streaming** — connect/stream only while the avatar is actually speaking, auto-disconnect when idle, so free-tier minutes and cost stretch across long study sessions.
12. **Lazy-load `@spatius/avatarkit`** (dynamic import, like TF.js) so non-Spatius users don't download it.
13. Evaluate **self-hosted avatar** (Duix-Avatar / MuseTalk) on a GPU to remove per-minute fees entirely at scale.
14. Add a **provider switch UI/env** (`AVATAR_PROVIDER`) instead of implicit auto-select.

### D. Study features
15. **Multi-notebook management** (create/rename/delete, switch, per-notebook chat history UI).
16. **Persisted chat history** rendering (messages are stored; surface them on load).
17. **Study tools**: generated study guides, flashcards, quizzes, spaced-repetition, exam-prep mode.
18. **Source viewer** — open a source and highlight the cited passage when a citation is clicked.
19. **Voice input (STT)** so students can *talk* to Buddyy (Whisper / Deepgram) — completes the "keep the mic open and talk to it" vision. (Note: a LiveKit + avatar architecture is the alternative path for full voice conversations.)

### E. Focus monitoring upgrades
20. **Posture / gaze detection** (MediaPipe Pose / FaceMesh) to detect looking away, slouching, drowsiness.
21. **Session analytics** — focus timeline, distraction events, study-time stats, weekly reports.
22. **Configurable nudges** — tone, frequency, quiet mode; tie nudges to Pomodoro timers.

### F. Product / SaaS
23. **Billing & plans** (Stripe), per-user usage metering (LLM tokens + avatar minutes), cost caps.
24. **Onboarding**, empty states, mobile responsiveness pass.
25. **Automated tests** (auth flows especially) + CI/CD + staged environments.
26. **Accessibility & i18n** audit; keyboard-only pass across the immersive UI.

---

## 7. Environment Variables (reference)

See `server/.env.example` for the full list. Key groups:

- **Core:** `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `CLIENT_ORIGIN`, `COOKIE_SECURE`
- **LLM/Embeddings:** `LLM_PROVIDER`, `EMBEDDING_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_EMBED_MODEL` (+ Anthropic/Voyage/Ollama options)
- **Avatar (ANAM):** `ANAM_API_KEY`, `ANAM_AVATAR_ID`, `ANAM_VOICE_ID`
- **Avatar (Spatius):** `SPATIUS_API_KEY`, `SPATIUS_APP_ID`, `SPATIUS_AVATAR_ID`
- **TTS (Piper):** `PIPER_BIN`, `PIPER_MODEL`, `PIPER_SAMPLE_RATE`
