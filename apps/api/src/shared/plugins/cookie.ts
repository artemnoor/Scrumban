import cookie from '@fastify/cookie';
import type { FastifyInstance } from 'fastify';
import type { ApiEnv } from '../config/env';

export async function registerCookiePlugin(app: FastifyInstance, env: ApiEnv) {
  app.log.info(
    {
      cookieName: env.SESSION_COOKIE_NAME
    },
    '[shared/plugins/cookie] Registering cookie plugin'
  );

  await app.register(cookie, {
    secret: env.SESSION_COOKIE_SECRET,
    hook: 'onRequest'
  });
}
