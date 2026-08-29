import { describe, it, expect } from 'vitest';
import { generateOpaqueToken, hashToken, signAccessToken, verifyAccessToken } from '../src/lib/tokens';

describe('opaque tokens', () => {
  it('generates unique 64-char hex tokens', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('hashes deterministically and never returns the raw token', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });
});

describe('access tokens', () => {
  it('round-trips the subject and role', () => {
    const jwt = signAccessToken({ sub: 'user_123', role: 'student' });
    const decoded = verifyAccessToken(jwt);
    expect(decoded).toMatchObject({ sub: 'user_123', role: 'student' });
  });

  it('rejects a tampered token', () => {
    const jwt = signAccessToken({ sub: 'user_123', role: 'student' });
    expect(() => verifyAccessToken(jwt + 'tamper')).toThrow();
  });
});
