import { Router } from 'express';
import { authLimiter } from '../../middleware/rateLimit';
import { requireAuth } from '../../middleware/auth';
import { csrfGuard } from '../../middleware/csrf';
import * as controller from './auth.controller';

export const authRouter = Router();

authRouter.post('/register', authLimiter, controller.registerHandler);
authRouter.post('/verify-email', authLimiter, controller.verifyEmailHandler);
authRouter.post('/login', authLimiter, controller.loginHandler);
// Cookie-authenticated routes: guard against cross-site forgery.
authRouter.post('/refresh', csrfGuard, controller.refreshHandler);
authRouter.post('/logout', csrfGuard, controller.logoutHandler);
authRouter.post('/forgot-password', authLimiter, controller.forgotPasswordHandler);
authRouter.post('/reset-password', authLimiter, controller.resetPasswordHandler);
authRouter.get('/me', requireAuth, controller.meHandler);
