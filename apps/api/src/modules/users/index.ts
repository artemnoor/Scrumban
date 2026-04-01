import type { FastifyPluginAsync } from 'fastify';
import { userSchema } from '@scrumbun/shared/auth';
import type { AuthRepository } from '../auth/repositories/auth-repository';
import type { ApiEnv } from '../../shared/config/env';
import { requireAuthenticatedUser } from '../../shared/http/authorization';
import {
  PrismaUsersRepository,
  type UsersRepository
} from './repositories/users-repository';

type UsersModuleOptions = {
  env: ApiEnv;
  authRepository?: AuthRepository;
  repository?: UsersRepository;
};

export function buildUsersModule(options: UsersModuleOptions): FastifyPluginAsync {
  return async function usersModule(app) {
    const repository = options.repository ?? new PrismaUsersRepository();

    app.log.info('[modules/users] Registering users module routes');

    app.get('/', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository);

      request.log.info(
        {
          actorId: actor.id
        },
        '[modules/users] Listing users'
      );

      const users = await repository.listUsers();

      return reply.code(200).send(
        users.map((user) =>
          userSchema.parse({
            ...user,
            emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString()
          })
        )
      );
    });
  };
}
