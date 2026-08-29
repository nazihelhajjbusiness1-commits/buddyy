import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/tokens';
import { HttpError } from '../utils/httpError';

/** Requires a valid Bearer access token; attaches `req.user`. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing access token');
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    throw new HttpError(401, 'Invalid or expired access token');
  }
}

/** Requires the authenticated user to hold one of the given roles. */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, 'Insufficient permissions');
    }
    next();
  };
}
