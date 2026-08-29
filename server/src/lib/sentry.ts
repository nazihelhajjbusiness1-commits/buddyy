import { createRequire } from 'node:module';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Optional Sentry error reporting. Kept dependency-free: we only load
 * `@sentry/node` at runtime (via require) when SENTRY_DSN is set AND the package
 * is installed. This means the app builds and runs without Sentry, and turning
 * it on is just `npm i @sentry/node` + setting SENTRY_DSN — no code change.
 */
type SentryLike = {
  init: (opts: { dsn: string; environment: string; tracesSampleRate?: number }) => void;
  captureException: (err: unknown) => void;
};

let sentry: SentryLike | null = null;

export function initSentry(): void {
  if (!env.SENTRY_DSN) return;
  try {
    const nodeRequire = createRequire(__filename);
    sentry = nodeRequire('@sentry/node') as SentryLike;
    sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.1 });
    logger.info('Sentry initialized');
  } catch {
    logger.warn('SENTRY_DSN set but @sentry/node is not installed; skipping. Run: npm i @sentry/node');
  }
}

export function captureException(err: unknown): void {
  sentry?.captureException(err);
}
