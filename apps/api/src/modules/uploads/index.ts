import type { FastifyPluginAsync } from 'fastify';

export const uploadsModule: FastifyPluginAsync = async function uploadsModule(app) {
  app.log.info('[modules/uploads] Uploads module placeholder registered');
};
