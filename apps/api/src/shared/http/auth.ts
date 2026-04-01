import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { createLogger } from '@scrumbun/config';
import {
  PrismaAuthRepository,
  type AuthRepository,
  type UserRecord
} from '../../modules/auth/repositories/auth-repository';
import type { ApiEnv } from '../config/env';

const logger = createLogger('apps/api/shared/http/auth');

export type RequestUser = Omit<UserRecord, 'passwordHash'>;

function getRequestRoute(request: FastifyRequest): string {
  return request.routeOptions.url ?? request.url;
}

function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function mapRequestUser(user: UserRecord): RequestUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerificationStatus: user.emailVerificationStatus,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export function readSignedSessionCookie(request: FastifyRequest, env: ApiEnv): string | null {
  const rawCookie = request.cookies[env.SESSION_COOKIE_NAME];

  if (!rawCookie) {
    request.log.debug('[shared/http/auth] Session cookie missing');
    return null;
  }

  const unsignedCookie = request.unsignCookie(rawCookie);

  if (!unsignedCookie.valid) {
    request.log.warn('[shared/http/auth] Session cookie signature invalid');
    return null;
  }

  request.log.debug('[shared/http/auth] Session cookie extracted successfully');
  return unsignedCookie.value;
}

export async function resolveRequestUser(
  request: FastifyRequest,
  env: ApiEnv,
  repository: AuthRepository = new PrismaAuthRepository()
): Promise<RequestUser | null> {
  logger.debug('Resolving request user from session cookie', {
    route: getRequestRoute(request),
    method: request.method
  });

  const rawToken = readSignedSessionCookie(request, env);

  if (!rawToken) {
    logger.warn('Request user resolution failed because session cookie was missing', {
      route: getRequestRoute(request),
      method: request.method
    });
    return null;
  }

  const session = await repository.findSessionByTokenHash(hashSessionToken(rawToken));

  if (!session) {
    logger.warn('Request user resolution failed because session token was not found', {
      route: getRequestRoute(request),
      method: request.method
    });
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    logger.warn('Request user resolution found expired session and will delete it', {
      sessionId: session.id
    });
    await repository.deleteSessionByTokenHash(session.tokenHash);
    return null;
  }

  logger.info('Request user resolved successfully', {
    sessionId: session.id,
    userId: session.user.id,
    role: session.user.role
  });

  return mapRequestUser(session.user);
}
