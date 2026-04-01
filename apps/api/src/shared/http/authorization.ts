import type { FastifyRequest } from 'fastify'
import { createLogger } from '@scrumbun/config'
import type { AuthRepository } from '../../modules/auth/repositories/auth-repository'
import type { ApiEnv } from '../config/env'
import { resolveRequestUser, type RequestUser } from './auth'

const logger = createLogger('apps/api/shared/http/authorization')

export class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export type BoardAccessTarget = {
  id: string
  ownerId: string | null
  members: Array<{ userId: string }> | string[]
}

export function createUnauthorizedError(message = 'UNAUTHORIZED') {
  return new HttpError(message, 401)
}

export function createForbiddenError(message = 'FORBIDDEN') {
  return new HttpError(message, 403)
}

export function createNotFoundError(message = 'NOT_FOUND') {
  return new HttpError(message, 404)
}

export function createBadRequestError(message = 'BAD_REQUEST') {
  return new HttpError(message, 400)
}

function getRequestRoute(request: FastifyRequest): string {
  return request.routeOptions.url ?? request.url
}

function normalizeBoardMemberIds(members: BoardAccessTarget['members']) {
  return members.map((member) => (typeof member === 'string' ? member : member.userId))
}

export function canReadBoard(actor: RequestUser, board: BoardAccessTarget) {
  if (actor.role === 'admin') {
    return true
  }

  if (board.ownerId === actor.id) {
    return true
  }

  return normalizeBoardMemberIds(board.members).includes(actor.id)
}

export function canManageBoard(actor: RequestUser, board: BoardAccessTarget) {
  if (actor.role === 'admin') {
    return true
  }

  return board.ownerId === actor.id
}

export function assertCanReadBoard(
  actor: RequestUser,
  board: BoardAccessTarget,
  errorCode = 'BOARD_FORBIDDEN'
) {
  if (canReadBoard(actor, board)) {
    logger.debug('Board read access granted', {
      actorId: actor.id,
      boardId: board.id,
      role: actor.role
    })
    return
  }

  logger.warn('Board read access rejected', {
    actorId: actor.id,
    boardId: board.id,
    ownerId: board.ownerId,
    role: actor.role
  })
  throw createForbiddenError(errorCode)
}

export function assertCanManageBoard(
  actor: RequestUser,
  board: BoardAccessTarget,
  errorCode = 'BOARD_FORBIDDEN'
) {
  if (canManageBoard(actor, board)) {
    logger.debug('Board management access granted', {
      actorId: actor.id,
      boardId: board.id,
      role: actor.role
    })
    return
  }

  logger.warn('Board management access rejected', {
    actorId: actor.id,
    boardId: board.id,
    ownerId: board.ownerId,
    role: actor.role
  })
  throw createForbiddenError(errorCode)
}

export async function requireAuthenticatedUser(
  request: FastifyRequest,
  env: ApiEnv,
  repository?: AuthRepository
): Promise<RequestUser> {
  const user = await resolveRequestUser(request, env, repository)

  if (!user) {
    logger.warn('Rejecting anonymous request', {
      route: getRequestRoute(request),
      method: request.method
    })
    throw createUnauthorizedError()
  }

  logger.debug('Authenticated request accepted', {
    route: getRequestRoute(request),
    method: request.method,
    userId: user.id
  })

  return user
}

export async function requireAdminUser(
  request: FastifyRequest,
  env: ApiEnv,
  repository?: AuthRepository
): Promise<RequestUser> {
  const user = await requireAuthenticatedUser(request, env, repository)

  if (user.role !== 'admin') {
    logger.warn('Rejecting non-admin request', {
      route: getRequestRoute(request),
      method: request.method,
      userId: user.id
    })
    throw createForbiddenError()
  }

  logger.info('Admin request accepted', {
    route: getRequestRoute(request),
    method: request.method,
    userId: user.id
  })

  return user
}
