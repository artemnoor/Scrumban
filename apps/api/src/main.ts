import { loadNodeEnv } from '@scrumbun/config';
import { createApp } from './app';
import { getApiEnv } from './shared/config/env';

async function main() {
  loadNodeEnv();
  const env = getApiEnv();
  const app = await createApp(env);

  app.log.info(
    {
      port: env.API_PORT,
      nodeEnv: env.NODE_ENV,
      deploymentTarget: env.DEPLOYMENT_TARGET,
      trustProxy: env.TRUST_PROXY
    },
    '[main] Starting API server'
  );

  try {
    await app.listen({
      host: '0.0.0.0',
      port: env.API_PORT
    });

    app.log.info('[main] API server started successfully');
  } catch (error) {
    app.log.error(
      {
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      '[main] API server failed to start'
    );
    process.exitCode = 1;
  }
}

void main();
