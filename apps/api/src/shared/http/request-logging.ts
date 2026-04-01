import type { FastifyInstance } from 'fastify';

export function registerRequestLogging(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    request.log.debug(
      {
        method: request.method,
        url: request.url
      },
      '[shared/http/request-logging] Request started'
    );
  });

  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode
      },
      '[shared/http/request-logging] Request completed'
    );
  });
}
