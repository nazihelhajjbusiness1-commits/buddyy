import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessPayload {
  sub: string;
  role: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET);
  if (typeof decoded === 'string') throw new Error('Malformed token');
  return { sub: String(decoded.sub), role: String(decoded.role) };
}

/** Opaque, high-entropy token handed to the client (refresh / email / reset). */
export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** We only ever persist the hash, so a DB leak can't be replayed. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
