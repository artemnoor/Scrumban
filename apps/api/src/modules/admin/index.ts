import type { FastifyPluginAsync } from 'fastify'
import type { ApiEnv } from '../../shared/config/env'
import type { AuthRepository } from '../auth/repositories/auth-repository'
import { requireAdminUser } from '../../shared/http/authorization'
import {
  PrismaAdminRepository,
  type AdminRepository
} from './repositories/admin-repository'
import { AdminService } from './services/admin-service'
import {
  boardParamsSchema,
  moderateBoardArchiveSchema,
  moderateTaskArchiveSchema,
  moderateTaskAssignmentSchema,
  moderateTaskColumnSchema,
  taskParamsSchema
} from './schemas'

type AdminModuleOptions = {
  env: ApiEnv
  authRepository?: AuthRepository
  repository?: AdminRepository
  service?: AdminService
}

export function buildAdminModule(options: AdminModuleOptions): FastifyPluginAsync {
  return async function adminModule(app) {
    const repository = options.repository ?? new PrismaAdminRepository()
    const service = options.service ?? new AdminService(repository)

    app.log.info('[modules/admin] Registering admin routes')

    app.get('/overview', async (request, reply) => {
      await requireAdminUser(request, options.env, options.authRepository)
      const overview = await service.getOverview()

      return reply.code(200).send(overview)
    })

    app.post('/boards/:boardId/archive', async (request, reply) => {
      const actor = await requireAdminUser(request, options.env, options.authRepository)
      const params = boardParamsSchema.parse(request.params)
      const input = moderateBoardArchiveSchema.parse(request.body)
      const board = await service.setBoardArchived(actor.id, params.boardId, input)

      return reply.code(200).send(board)
    })

    app.delete('/boards/:boardId', async (request, reply) => {
      await requireAdminUser(request, options.env, options.authRepository)
      const params = boardParamsSchema.parse(request.params)
      await service.deleteBoard(params.boardId)

      return reply.code(204).send()
    })

    app.post('/tasks/:taskId/archive', async (request, reply) => {
      const actor = await requireAdminUser(request, options.env, options.authRepository)
      const params = taskParamsSchema.parse(request.params)
      const input = moderateTaskArchiveSchema.parse(request.body)
      const task = await service.setTaskArchived(actor.id, params.taskId, input)

      return reply.code(200).send(task)
    })

    app.delete('/tasks/:taskId', async (request, reply) => {
      await requireAdminUser(request, options.env, options.authRepository)
      const params = taskParamsSchema.parse(request.params)
      await service.deleteTask(params.taskId)

      return reply.code(204).send()
    })

    app.post('/tasks/:taskId/assignee', async (request, reply) => {
      await requireAdminUser(request, options.env, options.authRepository)
      const params = taskParamsSchema.parse(request.params)
      const input = moderateTaskAssignmentSchema.parse(request.body)
      const task = await service.setTaskAssignment(params.taskId, input)

      return reply.code(200).send(task)
    })

    app.post('/tasks/:taskId/column', async (request, reply) => {
      await requireAdminUser(request, options.env, options.authRepository)
      const params = taskParamsSchema.parse(request.params)
      const input = moderateTaskColumnSchema.parse(request.body)
      const task = await service.setTaskColumn(params.taskId, input)

      return reply.code(200).send(task)
    })
  }
}
