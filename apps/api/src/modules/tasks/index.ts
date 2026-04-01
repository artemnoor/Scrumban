import type { FastifyPluginAsync } from 'fastify'
import type { ApiEnv } from '../../shared/config/env'
import type { AuthRepository } from '../auth/repositories/auth-repository'
import { requireAuthenticatedUser } from '../../shared/http/authorization'
import {
  PrismaBoardsRepository,
  type BoardsRepository
} from '../boards/repositories/boards-repository'
import {
  PrismaUsersRepository,
  type UsersRepository
} from '../users/repositories/users-repository'
import {
  PrismaTasksRepository,
  type TasksRepository
} from './repositories/tasks-repository'
import { TasksService } from './services/tasks-service'
import {
  archiveTaskSchema,
  createTaskSchema,
  listTasksQuerySchema,
  taskParamsSchema,
  updateTaskAssignmentSchema,
  updateTaskColumnSchema,
  updateTaskSchema
} from './schemas'

type TasksModuleOptions = {
  env: ApiEnv
  authRepository?: AuthRepository
  tasksRepository?: TasksRepository
  boardsRepository?: BoardsRepository
  usersRepository?: UsersRepository
  service?: TasksService
}

export function buildTasksModule(options: TasksModuleOptions): FastifyPluginAsync {
  return async function tasksModule(app) {
    const boardsRepository = options.boardsRepository ?? new PrismaBoardsRepository()
    const usersRepository = options.usersRepository ?? new PrismaUsersRepository()
    const tasksRepository = options.tasksRepository ?? new PrismaTasksRepository()
    const service =
      options.service ?? new TasksService(tasksRepository, boardsRepository, usersRepository)

    app.log.info('[modules/tasks] Registering task routes')

    app.get('/', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const query = listTasksQuerySchema.parse(request.query)
      const tasks = await service.listTasks(actor, query.boardId, query.includeArchived)

      return reply.code(200).send(tasks)
    })

    app.post('/', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const input = createTaskSchema.parse(request.body)
      const task = await service.createTask(actor, input)

      return reply.code(201).send(task)
    })

    app.get('/:taskId', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = taskParamsSchema.parse(request.params)
      const task = await service.getTask(actor, params.taskId)

      return reply.code(200).send(task)
    })

    app.patch('/:taskId', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = taskParamsSchema.parse(request.params)
      const input = updateTaskSchema.parse(request.body)
      const task = await service.updateTask(actor, params.taskId, input)

      return reply.code(200).send(task)
    })

    app.post('/:taskId/column', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = taskParamsSchema.parse(request.params)
      const input = updateTaskColumnSchema.parse(request.body)
      const task = await service.updateTaskColumn(actor, params.taskId, input)

      return reply.code(200).send(task)
    })

    app.post('/:taskId/assignee', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = taskParamsSchema.parse(request.params)
      const input = updateTaskAssignmentSchema.parse(request.body)
      const task = await service.updateTaskAssignment(actor, params.taskId, input)

      return reply.code(200).send(task)
    })

    app.post('/:taskId/archive', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = taskParamsSchema.parse(request.params)
      const input = archiveTaskSchema.parse(request.body)
      const task = await service.setTaskArchived(actor, params.taskId, input.archived)

      return reply.code(200).send(task)
    })

    app.delete('/:taskId', async (request, reply) => {
      const actor = await requireAuthenticatedUser(request, options.env, options.authRepository)
      const params = taskParamsSchema.parse(request.params)
      await service.deleteTask(actor, params.taskId)

      return reply.code(204).send()
    })
  }
}
