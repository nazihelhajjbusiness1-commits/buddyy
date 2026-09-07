import { env } from '../config/env';
import { HttpError } from '../utils/httpError';

/** Gemini TTS always returns signed 16-bit little-endian mono PCM at 24kHz. */
export const TTS_SAMPLE_RATE = 24000;

export const ttsConfigured = (): boolean => Boolean(env.GEMINI_API_KEY);

export interface TtsResult {
  pcm: Buffer; // raw signed 16-bit little-endian mono PCM
  sampleRate: number;
}

/**
 * Synthesizes speech with Google Gemini's native TTS models (free AI Studio
 * tier — same key as chat/embeddings, no card, no separate Cloud project). The
 * model returns raw PCM16 mono at 24kHz inline (mimeType `audio/L16;rate=24000`),
 * which is exactly what the Spatius avatar consumes — no container to strip.
 */
export async function synthesizePcm(text: string): Promise<TtsResult> {
  if (!env.GEMINI_API_KEY) {
    return Promise.reject(new HttpError(503, 'TTS not configured. Set GEMINI_API_KEY.'));
  }

  const model = `models/${env.GEMINI_TTS_MODEL}`;
  const res = await fetch(
    `${env.GEMINI_BASE_URL}/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
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
    throw new HttpError(502, `Gemini TTS error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
  };
  const b64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) {
    throw new HttpError(502, 'Gemini TTS returned no audio.');
  }

  return { pcm: Buffer.from(b64, 'base64'), sampleRate: TTS_SAMPLE_RATE };
}
