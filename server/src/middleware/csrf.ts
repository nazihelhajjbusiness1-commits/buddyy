import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { HttpError } from '../utils/httpError';

/**
 * CSRF defense for cookie-authenticated, state-changing routes.
 *
 * The refresh cookie is sent automatically by the browser. With SameSite=None
 * (required for cross-origin deployments) that cookie would ride along on a
 * forged cross-site request, so we additionally require the request's Origin (or
 * Referer, as a fallback) to match our known client origin. Same-origin API
 * calls and non-browser clients (no Origin header) are allowed through.
 */
const ALLOWED = new Set([env.CLIENT_ORIGIN, env.APP_BASE_URL].filter(Boolean) as string[]);

export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.get('origin');
  const referer = req.get('referer');

  // No Origin/Referer → not a browser fetch (e.g. curl, server-to-server). The
  // refresh cookie can't be obtained by such a client cross-site, so allow it.
  if (!origin && !referer) return next();

  const source = origin ?? referer!;
  const ok = [...ALLOWED].some((allowed) => source === allowed || source.startsWith(`${allowed}/`));
  if (!ok) throw new HttpError(403, 'Cross-site request blocked');
  next();
}
