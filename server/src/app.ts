import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { globalLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/error';
import { authRouter } from './modules/auth/auth.routes';
import { notebooksRouter } from './modules/notebooks/notebooks.routes';
import { anamRouter } from './modules/anam/anam.routes';
import { spatiusRouter } from './modules/spatius/spatius.routes';
import { ttsRouter } from './modules/tts/tts.routes';

export function createApp() {
  const app = express();

  // Behind a reverse proxy / load balancer in production (for correct client IPs).
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Enable HSTS only when serving over HTTPS (production), so browsers pin
      // TLS for a year including subdomains. Disabled in dev (plain http).
      hsts: env.COOKIE_SECURE
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    }),
  );
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(globalLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/notebooks', notebooksRouter);
  app.use('/api/anam', anamRouter);
  app.use('/api/spatius', spatiusRouter);
  app.use('/api/tts', ttsRouter);

  // 404 for unknown API routes.
  app.use((_req, res) => {
    res.status(404).json({ error: 'NotFound' });
  });

  app.use(errorHandler);
  return app;
}
