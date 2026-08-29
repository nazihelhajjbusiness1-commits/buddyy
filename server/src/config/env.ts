import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  ACCESS_TOKEN_SECRET: z.string().min(32, 'ACCESS_TOKEN_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Public URL of the API itself (used to build absolute links in emails when the
  // frontend and API live on different origins). Falls back to CLIENT_ORIGIN.
  APP_BASE_URL: z.string().url().optional(),
  // NB: z.coerce.boolean() treats any non-empty string as true ("false" -> true),
  // so parse the flag explicitly.
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  // Cross-site cookies (Vercel frontend + Render API on different origins) require
  // SameSite=None; Secure. Defaults are computed below from COOKIE_SECURE.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).optional(),

  // --- Observability ---
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  // Optional Sentry DSN. When set (and @sentry/node is installed), errors are
  // reported. Left as a string here so the app runs without the dependency.
  SENTRY_DSN: z.string().optional(),

  // --- Transactional email (Resend HTTP API, no dependency required) ---
  // When RESEND_API_KEY is set and NODE_ENV=production, verification / reset
  // emails are actually sent; otherwise they are logged to the console (dev).
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Buddyy <onboarding@resend.dev>'),

  // --- File storage backend ---
  // "local" = disk (dev default). "s3" = any S3-compatible bucket (AWS S3,
  // Cloudflare R2, Backblaze B2) via the built-in dependency-free SigV4 client.
  STORAGE_BACKEND: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ENDPOINT: z.string().url().optional(), // e.g. https://<acct>.r2.cloudflarestorage.com
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // --- Documents & RAG ---
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),

  // Provider selection. "auto" uses a paid provider when its key is present,
  // otherwise the free dev fallback. Set to "gemini" or "ollama" explicitly.
  LLM_PROVIDER: z.enum(['auto', 'anthropic', 'gemini', 'ollama', 'dev']).default('auto'),
  EMBEDDING_PROVIDER: z.enum(['auto', 'voyage', 'gemini', 'ollama', 'dev']).default('auto'),

  // LLM (Claude). Used when LLM_PROVIDER is "anthropic" (or "auto" + key present).
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('claude-opus-4-8'),

  // Embeddings (Voyage AI). Used when EMBEDDING_PROVIDER is "voyage" (or "auto" + key present).
  VOYAGE_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default('voyage-3.5'),

  // Google Gemini — fast cloud LLM + embeddings, free tier via AI Studio.
  // Get a key: https://aistudio.google.com/apikey
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_BASE_URL: z.string().url().default('https://generativelanguage.googleapis.com/v1beta'),
  // Lite = low latency (~1s), ideal for the real-time talking-avatar feel.
  // Swap to "gemini-3.6-flash" for higher-quality (but slower, "thinking") answers.
  GEMINI_CHAT_MODEL: z.string().default('gemini-flash-lite-latest'),
  GEMINI_EMBED_MODEL: z.string().default('gemini-embedding-001'),

  // Ollama — free, local LLM + embeddings (https://ollama.com).
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_CHAT_MODEL: z.string().default('llama3.2'),
  OLLAMA_EMBED_MODEL: z.string().default('nomic-embed-text'),

  // ANAM — real-time talking avatar (https://anam.ai). The API key stays
  // server-side; the browser only ever receives short-lived session tokens.
  ANAM_API_KEY: z.string().optional(),
  ANAM_BASE_URL: z.string().url().default('https://api.anam.ai/v1'),
  ANAM_AVATAR_ID: z.string().optional(),
  ANAM_VOICE_ID: z.string().optional(),
  ANAM_PERSONA_NAME: z.string().default('Buddyy'),

  // Spatius — alternative real-time avatar (https://spatius.ai). Bring-your-own
  // audio: the SDK renders a 3D avatar client-side and is fed PCM16 audio. The
  // API key stays server-side; the App ID / Avatar ID are public (client needs them).
  SPATIUS_API_KEY: z.string().optional(),
  SPATIUS_APP_ID: z.string().optional(),
  SPATIUS_AVATAR_ID: z.string().optional(),
  SPATIUS_CONSOLE_URL: z.string().url().default('https://console.us-west.spatius.ai/v1'),

  // Piper TTS (self-hosted, free) — turns answer text into PCM16 audio that
  // drives the Spatius avatar. Point PIPER_BIN at the piper executable and
  // PIPER_MODEL at a voice .onnx. Match PIPER_SAMPLE_RATE to the voice model.
  PIPER_BIN: z.string().optional(),
  PIPER_MODEL: z.string().optional(),
  PIPER_SAMPLE_RATE: z.coerce.number().int().positive().default(22050),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

/**
 * Resolved cookie policy. Cross-origin deployments (frontend on Vercel, API on
 * Render) must use SameSite=None; Secure so the browser sends the refresh cookie
 * on cross-site requests. In that mode CSRF protection comes from the Origin
 * allowlist check (see middleware/csrf.ts).
 */
export const cookieSameSite: 'lax' | 'strict' | 'none' =
  env.COOKIE_SAMESITE ?? (env.COOKIE_SECURE ? 'none' : 'lax');

/** Absolute base URL for building links in emails. */
export const appBaseUrl = env.APP_BASE_URL ?? env.CLIENT_ORIGIN;
