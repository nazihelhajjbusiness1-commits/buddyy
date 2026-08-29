import { Router } from 'express';
import { env } from '../../config/env';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { HttpError } from '../../utils/httpError';

export const spatiusRouter = Router();

spatiusRouter.use(requireAuth);

/** Public config the client needs to initialize @spatius/avatarkit. */
spatiusRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    res.json({
      configured: Boolean(env.SPATIUS_API_KEY && env.SPATIUS_APP_ID && env.SPATIUS_AVATAR_ID),
      appId: env.SPATIUS_APP_ID ?? null,
      avatarId: env.SPATIUS_AVATAR_ID ?? null,
    });
  }),
);

/**
 * Session-token broker. The Spatius API key stays here; the browser only gets a
 * short-lived session token (valid < 24h) to open the Motion Server WebSocket.
 */
spatiusRouter.post(
  '/session-token',
  asyncHandler(async (_req, res) => {
    if (!env.SPATIUS_API_KEY || !env.SPATIUS_APP_ID || !env.SPATIUS_AVATAR_ID) {
      throw new HttpError(
        503,
        'Spatius not configured. Set SPATIUS_API_KEY, SPATIUS_APP_ID and SPATIUS_AVATAR_ID.',
      );
    }

    const expireAt = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
    const spatiusRes = await fetch(`${env.SPATIUS_CONSOLE_URL}/console/session-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': env.SPATIUS_API_KEY,
      },
      body: JSON.stringify({ expireAt }),
    });

    if (!spatiusRes.ok) {
      throw new HttpError(
        502,
        `Spatius session error ${spatiusRes.status}: ${await spatiusRes.text()}`,
      );
    }

    const data = (await spatiusRes.json()) as { sessionToken: string };
    res.json({ sessionToken: data.sessionToken });
  }),
);
