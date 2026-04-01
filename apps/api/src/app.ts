import Fastify from 'fastify';
import { getRuntimeConfig } from '@scrumbun/config';
import { prisma } from '@scrumbun/db';
import type { ApiEnv } from './shared/config/env';
import { getApiEnv } from './shared/config/env';
import { registerCookiePlugin } from './shared/plugins/cookie';
import { registerCorsPlugin } from './shared/plugins/cors';
import { registerErrorHandler } from './shared/http/error-handler';
import { registerRequestLogging } from './shared/http/request-logging';
import { buildAuthModule } from './modules/auth';
import { buildUsersModule } from './modules/users';
import { buildBoardsModule } from './modules/boards';
import { buildTasksModule } from './modules/tasks';
import { uploadsModule } from './modules/uploads';
import { buildAdminModule } from './modules/admin';

export async function createApp(overrides: Partial<Record<keyof ApiEnv, unknown>> = {}) {
  const env = getApiEnv(overrides);
  const runtime = getRuntimeConfig();
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL
    },
    trustProxy: env.TRUST_PROXY
  });

  app.log.info(
    {
      environment: runtime.environment,
      logLevel: runtime.logLevel,
      deploymentTarget: env.DEPLOYMENT_TARGET,
      trustProxy: env.TRUST_PROXY
    },
    '[app] Creating Fastify application'
  );

  await registerCookiePlugin(app, env);
  await registerCorsPlugin(app, env);
  registerRequestLogging(app);
  registerErrorHandler(app);

  app.get('/health', async () => {
    return {
      ok: true,
      service: 'api',
      environment: env.NODE_ENV,
      deploymentTarget: env.DEPLOYMENT_TARGET
    };
  });

  app.get('/api/health', async () => {
    return {
      ok: true,
      service: 'api',
      environment: env.NODE_ENV,
      deploymentTarget: env.DEPLOYMENT_TARGET
    };
  });

  app.get('/api/ready', async (request, reply) => {
    request.log.debug('[app] Readiness probe started');

    try {
      await prisma.$queryRaw`SELECT 1`;

      return {
        ok: true,
        service: 'api',
        readiness: 'ready',
        database: 'connected',
        environment: env.NODE_ENV,
        deploymentTarget: env.DEPLOYMENT_TARGET
      };
    } catch (error) {
      request.log.error(
        {
          message: error instanceof Error ? error.message : 'Unknown readiness error'
        },
        '[app] Readiness probe failed'
      );

      return reply.code(503).send({
        ok: false,
        service: 'api',
        readiness: 'not-ready',
        database: 'unavailable'
      });
    };
  });

  await app.register(async (api) => {
    await api.register(buildAuthModule({ env }), { prefix: '/auth' });
    await api.register(buildUsersModule({ env }), { prefix: '/users' });
    await api.register(buildBoardsModule({ env }), { prefix: '/boards' });
    await api.register(buildTasksModule({ env }), { prefix: '/tasks' });
    await api.register(uploadsModule, { prefix: '/uploads' });
    await api.register(buildAdminModule({ env }), { prefix: '/admin' });
  }, { prefix: '/api' });

  return app;
}
