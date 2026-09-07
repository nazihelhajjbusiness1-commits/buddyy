import { env } from '../config/env';
import { HttpError } from '../utils/httpError';
import { logger } from './logger';

/** Gemini TTS always returns signed 16-bit little-endian mono PCM at 24kHz. */
export const TTS_SAMPLE_RATE = 24000;

export const ttsConfigured = (): boolean => Boolean(env.GEMINI_API_KEY);

export interface TtsResult {
  pcm: Buffer; // raw signed 16-bit little-endian mono PCM
  sampleRate: number;
}

/**
 * Preview TTS models frequently return 503 UNAVAILABLE ("high demand") on the
 * free tier. We retry with backoff, and fall back across models so a spike on
 * one model can be served by another. The configured model is tried first.
 */
const TTS_MODELS = [...new Set([env.GEMINI_TTS_MODEL, 'gemini-3.1-flash-tts-preview'])];
/** Google statuses worth retrying (transient capacity / rate limits). */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Synthesizes speech with Google Gemini's native TTS models (free AI Studio
 * tier — same key as chat/embeddings, no card, no separate Cloud project). The
 * model returns raw PCM16 mono at 24kHz inline (mimeType `audio/L16;rate=24000`),
 * which is exactly what the Spatius avatar consumes — no container to strip.
 */
/** A transient (retryable) TTS failure — carries the upstream Google status. */
class TtsTransientError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** One synthesis attempt against a specific model. Throws on any failure. */
async function callGeminiTts(modelName: string, text: string): Promise<Buffer> {
  const res = await fetch(
    `${env.GEMINI_BASE_URL}/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: env.GEMINI_TTS_VOICE } },
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    const message = `Gemini TTS error ${res.status}: ${detail}`;
    if (RETRYABLE.has(res.status)) throw new TtsTransientError(res.status, message);
    throw new HttpError(502, message); // non-retryable (auth, bad request, etc.)
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
  };
  const b64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new HttpError(502, 'Gemini TTS returned no audio.');
  return Buffer.from(b64, 'base64');
}

export async function synthesizePcm(text: string): Promise<TtsResult> {
  if (!env.GEMINI_API_KEY) {
    return Promise.reject(new HttpError(503, 'TTS not configured. Set GEMINI_API_KEY.'));
  }

  let lastTransient: TtsTransientError | null = null;
  // Favor speed: one quick retry per model, then fall back to the next model.
  // A hard error (auth/bad request) throws immediately. Worst case ~4 calls with
  // a single short backoff, keeping the avatar responsive during 503 spikes.
  for (const modelName of TTS_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const pcm = await callGeminiTts(modelName, text);
        return { pcm, sampleRate: TTS_SAMPLE_RATE };
      } catch (err) {
        if (!(err instanceof TtsTransientError)) throw err;
        lastTransient = err;
        logger.warn('Gemini TTS transient failure', {
          model: modelName,
          attempt: attempt + 1,
          status: err.status,
        });
        if (attempt < 1) await sleep(250); // one short retry, then next model
      }
    }
  }

  // Every model was overloaded. Surface 503 so the client can retry/skip audio.
  throw new HttpError(503, lastTransient?.message ?? 'Gemini TTS unavailable (all models busy).');
}
