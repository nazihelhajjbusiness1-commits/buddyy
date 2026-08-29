import { Router } from 'express';
import { env } from '../../config/env';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { HttpError } from '../../utils/httpError';

export const anamRouter = Router();

anamRouter.use(requireAuth);

/** Whether the avatar is configured on the server (lets the client decide UI). */
anamRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({
      configured: Boolean(env.ANAM_API_KEY && env.ANAM_AVATAR_ID && env.ANAM_VOICE_ID),
    });
  }),
);

/**
 * Session-token broker. Mints a short-lived ANAM session token using the
 * server-side API key and returns it to the client. `llmId: CUSTOMER_CLIENT_V1`
 * disables ANAM's built-in brain so *we* drive what the avatar says.
 */
anamRouter.post(
  '/session-token',
  asyncHandler(async (_req, res) => {
    if (!env.ANAM_API_KEY || !env.ANAM_AVATAR_ID || !env.ANAM_VOICE_ID) {
      throw new HttpError(
        503,
        'Avatar not configured. Set ANAM_API_KEY, ANAM_AVATAR_ID and ANAM_VOICE_ID.',
      );
    }

    const anamRes = await fetch(`${env.ANAM_BASE_URL}/auth/session-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ANAM_API_KEY}`,
      },
      body: JSON.stringify({
        personaConfig: {
          name: env.ANAM_PERSONA_NAME,
          avatarId: env.ANAM_AVATAR_ID,
          voiceId: env.ANAM_VOICE_ID,
          llmId: 'CUSTOMER_CLIENT_V1',
        },
        sessionOptions: { videoQuality: 'high' },
      }),
    });

    if (!anamRes.ok) {
      throw new HttpError(502, `ANAM session error ${anamRes.status}: ${await anamRes.text()}`);
    }

    const data = (await anamRes.json()) as { sessionToken: string };
    res.json({ sessionToken: data.sessionToken });
  }),
);
