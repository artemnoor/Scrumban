import type { FastifyPluginAsync } from 'fastify';
import { createLogger } from '@scrumbun/config';
import {
  loginInputSchema,
  registerInputSchema,
  resendVerificationInputSchema,
  verifyEmailInputSchema
} from './schemas';
import { readSignedSessionCookie } from '../../shared/http/auth';
import type { ApiEnv } from '../../shared/config/env';
import { AuthService } from './services/auth-service';
import { PrismaAuthRepository } from './repositories/auth-repository';
import type { AuthRepository } from './repositories/auth-repository';
import { SmtpAuthMailer, type AuthMailer } from './mail/auth-mailer';

type AuthModuleOptions = {
  env: ApiEnv;
  repository?: AuthRepository;
  mailer?: AuthMailer;
};

const logger = createLogger('apps/api/auth-module');

export function buildAuthModule(options: AuthModuleOptions): FastifyPluginAsync {
  return async function authModule(app) {
    const repository = options.repository ?? new PrismaAuthRepository();
    const mailer = options.mailer ?? new SmtpAuthMailer(options.env);
    const authService = new AuthService(repository, options.env, mailer);

    logger.info('Registering auth module routes');

    app.post('/register', async (request, reply) => {
      request.log.debug('[modules/auth] Register endpoint hit');

      const input = registerInputSchema.parse(request.body);
      const result = await authService.register(input);

      return reply.code(202).send(result);
    });

    app.post('/login', async (request, reply) => {
      request.log.debug('[modules/auth] Login endpoint hit');

      const input = loginInputSchema.parse(request.body);
      const session = await authService.login(input);

      reply.setCookie(options.env.SESSION_COOKIE_NAME, session.rawToken, {
        signed: true,
        httpOnly: true,
        path: '/',
        sameSite: options.env.SESSION_COOKIE_SAME_SITE,
        secure: options.env.SESSION_COOKIE_SECURE,
        ...(options.env.SESSION_COOKIE_DOMAIN ? { domain: options.env.SESSION_COOKIE_DOMAIN } : {})
      });

      return reply.code(200).send({
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        user: session.user
      });
    });

    app.post('/resend-verification', async (request, reply) => {
      request.log.debug('[modules/auth] Resend verification endpoint hit');

      const input = resendVerificationInputSchema.parse(request.body);
      const result = await authService.resendVerification(input.email);

      return reply.code(202).send(result);
    });

    app.post('/verify-email', async (request, reply) => {
      request.log.debug('[modules/auth] Verify email endpoint hit');

      const input = verifyEmailInputSchema.parse(request.body);
      const result = await authService.verifyEmail(input.token);

      return reply.code(200).send(result);
    });

    app.post('/logout', async (request, reply) => {
      request.log.debug('[modules/auth] Logout endpoint hit');

      const rawToken = readSignedSessionCookie(request, options.env);
      await authService.logout(rawToken);

      reply.clearCookie(options.env.SESSION_COOKIE_NAME, {
        path: '/',
        ...(options.env.SESSION_COOKIE_DOMAIN ? { domain: options.env.SESSION_COOKIE_DOMAIN } : {})
      });

      return reply.code(204).send();
    });

    app.get('/me', async (request, reply) => {
      request.log.debug('[modules/auth] Me endpoint hit');

      const rawToken = readSignedSessionCookie(request, options.env);
      const session = await authService.resolveSession(rawToken);

      if (!session) {
        request.log.warn('[modules/auth] Unauthorized session lookup');
        return reply.code(401).send({
          error: 'UNAUTHORIZED'
        });
      }

      return reply.code(200).send({
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        user: session.user
      });
    });
  };
}
