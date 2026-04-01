import { Prisma, PrismaClient } from '../generated/prisma/index.js';
import { createLogger, loadNodeEnv } from '@scrumbun/config';

loadNodeEnv();

declare global {
  var __scrumbunPrisma__: PrismaClient | undefined;
}

const logger = createLogger('packages/db/client');

function createPrismaClient() {
  logger.info('Creating Prisma client', {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    logLevel: process.env.LOG_LEVEL ?? 'debug'
  });

  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'stdout', level: 'info' },
      { emit: 'stdout', level: 'warn' },
      { emit: 'stdout', level: 'error' }
    ]
  });

  client.$on('query', (event: Prisma.QueryEvent) => {
    if ((process.env.LOG_LEVEL ?? 'debug').toLowerCase() !== 'debug') {
      return;
    }

    logger.debug('Prisma query executed', {
      durationMs: event.duration,
      target: event.target
    });
  });

  return client;
}

export const prisma = globalThis.__scrumbunPrisma__ ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__scrumbunPrisma__ = prisma;
}
