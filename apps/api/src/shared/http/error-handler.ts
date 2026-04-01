import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const normalizedError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'Unknown error');

    request.log.error(
      {
        message: normalizedError.message,
        stack: normalizedError.stack
      },
      '[shared/http/error-handler] Handling request error'
    );

    if (normalizedError instanceof ZodError) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: normalizedError.flatten()
      });
    }

    if ((error as { statusCode?: number }).statusCode) {
      return reply.code((error as { statusCode: number }).statusCode).send({
        error: normalizedError.message,
        details: (error as { details?: unknown }).details
      });
    }

    return reply.code(500).send({
      error: 'INTERNAL_SERVER_ERROR'
    });
  });
}
