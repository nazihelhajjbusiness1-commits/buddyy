import crypto from 'node:crypto';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { hashPassword, verifyPassword } from '../../lib/password';
import { generateOpaqueToken, hashToken, signAccessToken } from '../../lib/tokens';
import { sendMail } from '../../lib/mailer';
import { env } from '../../config/env';
import { HttpError } from '../../utils/httpError';

const DAY_MS = 24 * 60 * 60 * 1000;
const refreshTtlMs = () => env.REFRESH_TOKEN_TTL_DAYS * DAY_MS;
const VERIFY_TTL_MS = DAY_MS; // 24h
const RESET_TTL_MS = 30 * 60 * 1000; // 30m

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Fields safe to return to the client. */
export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}

// ---------------------------------------------------------------- register
export async function register(email: string, password: string, name?: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // NOTE: reveals that an email is taken. For stricter anti-enumeration,
    // return a generic success and email the existing owner instead.
    throw new HttpError(409, 'Email already registered');
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash, name } });
  await issueEmailVerification(user.id, user.email);
}

async function issueEmailVerification(userId: string, email: string): Promise<void> {
  const token = generateOpaqueToken();
  await prisma.verificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      type: 'email_verify',
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    },
  });
  const link = `${env.CLIENT_ORIGIN}/auth.html?mode=verify&token=${token}`;
  await sendMail(email, 'Verify your Buddyy account', `Confirm your email:\n${link}`);
}

// ------------------------------------------------------------ verify email
export async function verifyEmail(token: string): Promise<void> {
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (
    !record ||
    record.type !== 'email_verify' ||
    record.usedAt ||
    record.expiresAt < new Date()
  ) {
    throw new HttpError(400, 'Invalid or expired verification token');
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
    prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
}

// ------------------------------------------------------------------- login
export async function login(email: string, password: string): Promise<{ user: User } & AuthTokens> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-ish work whether or not the user exists (mitigates timing/enumeration).
  const passwordOk = user
    ? await verifyPassword(user.passwordHash, password)
    : await verifyPassword(
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000',
        password,
      ).catch(() => false);

  if (!user || !passwordOk) throw new HttpError(401, 'Invalid credentials');
  if (!user.emailVerified) throw new HttpError(403, 'Please verify your email first');

  const tokens = await issueTokens(user.id, user.role, crypto.randomUUID());
  return { user, ...tokens };
}

async function issueTokens(userId: string, role: string, familyId: string): Promise<AuthTokens> {
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = generateOpaqueToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + refreshTtlMs()),
    },
  });
  return { accessToken, refreshToken };
}

// ----------------------------------------------------------------- refresh
export async function refresh(oldToken: string): Promise<AuthTokens> {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(oldToken) },
  });
  if (!record) throw new HttpError(401, 'Invalid refresh token');

  // Reuse detection: a revoked/expired token was replayed → burn the whole family.
  if (record.revokedAt || record.expiresAt < new Date()) {
    await prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new HttpError(401, 'Refresh token reuse detected — session revoked');
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) throw new HttpError(401, 'Invalid refresh token');

  // Rotate within the same family.
  const newToken = generateOpaqueToken();
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(newToken),
        familyId: record.familyId,
        expiresAt: new Date(Date.now() + refreshTtlMs()),
      },
    }),
  ]);

  return { accessToken: signAccessToken({ sub: user.id, role: user.role }), refreshToken: newToken };
}

// ------------------------------------------------------------------ logout
export async function logout(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// --------------------------------------------------------- forgot password
export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always behave identically to avoid leaking which emails exist.
  if (!user) return;

  const token = generateOpaqueToken();
  await prisma.verificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      type: 'password_reset',
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  const link = `${env.CLIENT_ORIGIN}/auth.html?mode=reset&token=${token}`;
  await sendMail(email, 'Reset your Buddyy password', `Reset your password (valid 30 min):\n${link}`);
}

// ---------------------------------------------------------- reset password
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (
    !record ||
    record.type !== 'password_reset' ||
    record.usedAt ||
    record.expiresAt < new Date()
  ) {
    throw new HttpError(400, 'Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Revoke every active session after a password change.
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

// --------------------------------------------------------------------- me
export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');
  return publicUser(user);
}
