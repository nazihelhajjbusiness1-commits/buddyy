import type { Response } from 'express';
import { env, cookieSameSite } from '../../config/env';
import { asyncHandler } from '../../utils/asyncHandler';
import { HttpError } from '../../utils/httpError';
import * as authService from './auth.service';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schemas';

const REFRESH_COOKIE = 'buddyy_rt';

// Attributes must match between set and clear or the browser won't remove it.
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: cookieSameSite,
  path: '/api/auth',
} as const;

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...REFRESH_COOKIE_OPTS,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export const registerHandler = asyncHandler(async (req, res) => {
  const { email, password, name } = registerSchema.parse(req.body);
  await authService.register(email, password, name);
  res.status(201).json({ message: 'Account created. Check your email to verify it.' });
});

export const verifyEmailHandler = asyncHandler(async (req, res) => {
  const { token } = verifyEmailSchema.parse(req.body);
  await authService.verifyEmail(token);
  res.json({ message: 'Email verified. You can now log in.' });
});

export const loginHandler = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { user, accessToken, refreshToken } = await authService.login(email, password);
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken, user: authService.publicUser(user) });
});

export const refreshHandler = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new HttpError(401, 'Missing refresh token');
  const { accessToken, refreshToken } = await authService.refresh(token);
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken });
});

export const logoutHandler = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await authService.logout(token);
  res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTS);
  res.json({ message: 'Logged out' });
});

export const forgotPasswordHandler = asyncHandler(async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.forgotPassword(email);
  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
});

export const resetPasswordHandler = asyncHandler(async (req, res) => {
  const { token, password } = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(token, password);
  res.json({ message: 'Password updated. Please log in.' });
});

export const meHandler = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user!.id);
  res.json({ user });
});
