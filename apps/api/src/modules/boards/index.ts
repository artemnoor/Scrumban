import type { FastifyPluginAsync } from 'fastify'
import type { ApiEnv } from '../../shared/config/env'
import type { AuthRepository } from '../auth/repositories/auth-repository'
import { requireAuthenticatedUser } from '../../shared/http/authorization'
import { PrismaUsersRepository, type UsersRepository } from '../users/repositories/users-repository'
import {
  PrismaBoardsRepository,
  type BoardsRepository
} from './repositories/boards-repository'
import { BoardsService } from './services/boards-service'
import {
  addBoardMemberSchema,
  archiveBoardSchema,
  boardColumnParamsSchema,
  boardMemberParamsSchema,
  boardParamsSchema,
  createBoardColumnSchema,
  createBoardSchema,
  deleteBoardColumnSchema,
  joinBoardByInviteCodeSchema,
  listBoardsQuerySchema,
  reorderBoardColumnsSchema,
  updateBoardMemberColorSchema,
  updateBoardColumnSchema,
  updateBoardSchema
} from './schemas'

type BoardsModuleOptions = {
  env: ApiEnv
  authRepository?: AuthRepository
  repository?: BoardsRepository
  usersRepository?: UsersRepository
  service?: BoardsService
}

export function buildBoardsModule(options: BoardsModuleOptions): FastifyPluginAsync {
  return async function boardsModule(app) {
    const repository = options.repository ?? new PrismaBoardsRepository()
    const usersRepository = options.usersRepository ?? new PrismaUsersRepository()
    const service = options.service ?? new BoardsService(repository, usersRepository)

    app.log.info('[modules/boards] Registering board routes')

    app.get('/', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const query = listBoardsQuerySchema.parse(request.query)
      const boards = await service.listBoards(actor, query.includeArchived)

      return reply.code(200).send(boards)
    })

    app.post('/', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const input = createBoardSchema.parse(request.body)
      const board = await service.createBoard(actor, input)

      return reply.code(201).send(board)
    })

    app.post('/join', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const input = joinBoardByInviteCodeSchema.parse(request.body)
      const board = await service.joinBoardByInviteCode(actor, input)

      return reply.code(200).send(board)
    })

    app.get('/:boardId', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = boardParamsSchema.parse(request.params)
      const board = await service.getBoard(actor, params.boardId)

      return reply.code(200).send(board)
    })

    app.patch('/:boardId', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = boardParamsSchema.parse(request.params)
      const input = updateBoardSchema.parse(request.body)
      const board = await service.updateBoard(actor, params.boardId, input)

      return reply.code(200).send(board)
    })

    app.post('/:boardId/archive', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = boardParamsSchema.parse(request.params)
      const input = archiveBoardSchema.parse(request.body)
      const board = await service.setBoardArchived(actor, params.boardId, input.archived)

      return reply.code(200).send(board)
    })

    app.delete('/:boardId', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = boardParamsSchema.parse(request.params)
      await service.deleteBoard(actor, params.boardId)

      return reply.code(204).send()
    })

    app.post('/:boardId/members', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = boardParamsSchema.parse(request.params)
      const input = addBoardMemberSchema.parse(request.body)
      const board = await service.addBoardMember(actor, params.boardId, input)

      return reply.code(200).send(board)
    })

    app.delete('/:boardId/members/:userId', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = boardMemberParamsSchema.parse(request.params)
      const board = await service.removeBoardMember(actor, params.boardId, params.userId)

      return reply.code(200).send(board)
    })

    app.patch('/:boardId/members/:userId', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = boardMemberParamsSchema.parse(request.params)
      const input = updateBoardMemberColorSchema.parse(request.body)
      const board = await service.updateBoardMemberColor(actor, params.boardId, params.userId, input)

      return reply.code(200).send(board)
    })

    app.post('/:boardId/invite-code/regenerate', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = boardParamsSchema.parse(request.params)
      const board = await service.regenerateBoardInviteCode(actor, params.boardId)

      return reply.code(200).send(board)
    })

    app.post('/:boardId/columns', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = boardParamsSchema.parse(request.params)
      const input = createBoardColumnSchema.parse(request.body)
      const board = await service.createBoardColumn(actor, params.boardId, input)

      return reply.code(200).send(board)
    })

    app.patch('/:boardId/columns/:columnId', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = boardColumnParamsSchema.parse(request.params)
      const input = updateBoardColumnSchema.parse(request.body)
      const board = await service.updateBoardColumn(actor, params.boardId, params.columnId, input)

      return reply.code(200).send(board)
    })

    app.post('/:boardId/columns/reorder', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = boardParamsSchema.parse(request.params)
      const input = reorderBoardColumnsSchema.parse(request.body)
      const board = await service.reorderBoardColumns(actor, params.boardId, input.columnIds)

      return reply.code(200).send(board)
    })

    app.post('/:boardId/columns/:columnId/delete', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = boardColumnParamsSchema.parse(request.params)
      const input = deleteBoardColumnSchema.parse(request.body)
      const board = await service.deleteBoardColumn(actor, params.boardId, params.columnId, input)

      return reply.code(200).send(board)
    })
  }
}
