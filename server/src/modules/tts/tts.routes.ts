import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ttsConfigured, synthesizePcm } from '../../lib/tts';

export const ttsRouter = Router();

ttsRouter.use(requireAuth);

const speakSchema = z.object({ text: z.string().trim().min(1).max(4000) });

ttsRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({ configured: ttsConfigured(), sampleRate: env.PIPER_SAMPLE_RATE });
  }),
);

/** Returns raw PCM16 mono audio for the given text (drives the Spatius avatar). */
ttsRouter.post(
  '/speak',
  asyncHandler(async (req, res) => {
    const { text } = speakSchema.parse(req.body);
    const { pcm, sampleRate } = await synthesizePcm(text);
    res.setHeader('Content-Type', 'audio/L16');
    res.setHeader('X-Sample-Rate', String(sampleRate));
    res.setHeader('Cache-Control', 'no-store');
    res.send(pcm);
  }),
);
