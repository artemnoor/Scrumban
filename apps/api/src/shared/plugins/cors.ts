import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import type { ApiEnv } from '../config/env';

export async function registerCorsPlugin(app: FastifyInstance, env: ApiEnv) {
  app.log.info(
    {
      webOrigin: env.WEB_ORIGIN
    },
    '[shared/plugins/cors] Registering CORS plugin'
  );

  await app.register(cors, {
    credentials: true,
    origin: env.WEB_ORIGIN
  });
}
