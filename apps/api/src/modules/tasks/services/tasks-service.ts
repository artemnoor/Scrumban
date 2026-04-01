import { createLogger } from '@scrumbun/config'
import {
  taskSchema,
  type CreateTaskInput,
  type UpdateTaskAssignmentInput,
  type UpdateTaskColumnInput,
  type UpdateTaskInput
} from '@scrumbun/shared/tasks'
import type { RequestUser } from '../../../shared/http/auth'
import {
  assertCanReadBoard,
  createBadRequestError,
  createForbiddenError,
  createNotFoundError
} from '../../../shared/http/authorization'
import type { BoardRecord, BoardsRepository } from '../../boards/repositories/boards-repository'
import type { UsersRepository } from '../../users/repositories/users-repository'
import type { TaskRecord, TasksRepository } from '../repositories/tasks-repository'

const logger = createLogger('apps/api/tasks-service')

function mapTaskDto(task: TaskRecord) {
  return taskSchema.parse({
    id: task.id,
    boardId: task.boardId,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate?.toISOString() ?? null,
    assigneeId: task.assigneeId,
    createdById: task.createdById,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  })
}

export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly boardsRepository: BoardsRepository,
    private readonly usersRepository: UsersRepository
  ) {}

  async listTasks(actor: RequestUser, boardId: string, includeArchived: boolean) {
    const board = await this.requireBoard(boardId)
    assertCanReadBoard(actor, board, 'TASK_FORBIDDEN')

    logger.debug('Listing tasks for board', {
      actorId: actor.id,
      boardId,
      includeArchived
    })

    const tasks = await this.tasksRepository.listTasksByBoard(boardId, includeArchived)
    return tasks.map(mapTaskDto)
  }

  async getTask(actor: RequestUser, taskId: string) {
    const task = await this.requireTask(taskId)
    this.assertTaskBoardAccess(actor, task)
    return mapTaskDto(task)
  }

  async createTask(actor: RequestUser, input: CreateTaskInput) {
    const board = await this.requireBoard(input.boardId)
    assertCanReadBoard(actor, board, 'TASK_FORBIDDEN')

    if (board.archivedAt) {
      throw createBadRequestError('BOARD_ARCHIVED')
    }

    const columnId = input.columnId ?? board.columns[0]?.id

    if (!columnId) {
      throw createBadRequestError('BOARD_COLUMNS_REQUIRED')
    }

    this.assertColumnBelongsToBoard(board, columnId)

    if (input.assigneeId) {
      await this.requireAssignableUser(board, input.assigneeId)
    }

    logger.info('Creating task', {
      actorId: actor.id,
      boardId: input.boardId,
      columnId,
      assigneeId: input.assigneeId ?? null
    })

    const task = await this.tasksRepository.createTask({
      ...input,
      columnId,
      description: input.description ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      assigneeId: input.assigneeId ?? null,
      createdById: actor.id
    })

    return mapTaskDto(task)
  }

  async updateTask(actor: RequestUser, taskId: string, input: UpdateTaskInput) {
    const task = await this.requireTask(taskId)
    this.assertTaskBoardAccess(actor, task)

    if (task.archivedAt) {
      throw createBadRequestError('TASK_ARCHIVED')
    }

    const board = await this.requireBoard(task.boardId)

    if (input.assigneeId) {
      await this.requireAssignableUser(board, input.assigneeId)
    }

    logger.info('Updating task details', {
      actorId: actor.id,
      taskId
    })

    const updatedTask = await this.tasksRepository.updateTask(taskId, {
      title: input.title,
      description: input.description,
      dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
      assigneeId: input.assigneeId
    })

    return mapTaskDto(updatedTask)
  }

  async updateTaskColumn(actor: RequestUser, taskId: string, input: UpdateTaskColumnInput) {
    const task = await this.requireTask(taskId)
    this.assertTaskBoardAccess(actor, task)

    if (task.archivedAt) {
      throw createBadRequestError('TASK_ARCHIVED')
    }

    const board = await this.requireBoard(task.boardId)
    this.assertColumnBelongsToBoard(board, input.columnId)

    logger.info('Updating task column', {
      actorId: actor.id,
      taskId,
      fromColumnId: task.columnId,
      toColumnId: input.columnId
    })

    const updatedTask = await this.tasksRepository.setTaskColumn(taskId, input.columnId)
    return mapTaskDto(updatedTask)
  }

  async updateTaskAssignment(
    actor: RequestUser,
    taskId: string,
    input: UpdateTaskAssignmentInput
  ) {
    const task = await this.requireTask(taskId)
    this.assertTaskBoardAccess(actor, task)

    if (task.archivedAt) {
      throw createBadRequestError('TASK_ARCHIVED')
    }

    const board = await this.requireBoard(task.boardId)

    if (input.assigneeId) {
      await this.requireAssignableUser(board, input.assigneeId)
    }

    logger.info('Updating task assignment', {
      actorId: actor.id,
      taskId,
      assigneeId: input.assigneeId
    })

    const updatedTask = await this.tasksRepository.setTaskAssignment(taskId, input.assigneeId)
    return mapTaskDto(updatedTask)
  }

  async setTaskArchived(actor: RequestUser, taskId: string, archived: boolean) {
    const task = await this.requireTask(taskId)
    this.assertTaskBoardAccess(actor, task)

    logger.info('Changing task archive state', {
      actorId: actor.id,
      taskId,
      archived
    })

    const updatedTask = await this.tasksRepository.setTaskArchived(taskId, {
      archived,
      actorId: actor.id
    })

    return mapTaskDto(updatedTask)
  }

  async deleteTask(actor: RequestUser, taskId: string) {
    const task = await this.requireTask(taskId)
    this.assertTaskBoardAccess(actor, task)

    logger.warn('Permanently deleting task', {
      actorId: actor.id,
      taskId,
      boardId: task.boardId,
      archivedAt: task.archivedAt?.toISOString() ?? null
    })

    await this.tasksRepository.deleteTask(taskId)
  }

  private async requireBoard(boardId: string) {
    const board = await this.boardsRepository.findBoardById(boardId)

    if (!board) {
      logger.warn('Board not found during task operation', {
        boardId
      })
      throw createNotFoundError('BOARD_NOT_FOUND')
    }

    return board
  }

  private async requireTask(taskId: string) {
    const task = await this.tasksRepository.findTaskById(taskId)

    if (!task) {
      logger.warn('Task not found', {
        taskId
      })
      throw createNotFoundError('TASK_NOT_FOUND')
    }

    return task
  }

  private async requireAssignableUser(board: BoardRecord, userId: string) {
    const user = await this.usersRepository.findUserById(userId)

    if (!user) {
      logger.warn('Assignee user not found', {
        userId
      })
      throw createNotFoundError('ASSIGNEE_NOT_FOUND')
    }

    const isBoardParticipant =
      board.ownerId === userId || board.members.some((member) => member.userId === userId)

    if (!isBoardParticipant) {
      logger.warn('Assignee rejected because user is not a board member', {
        boardId: board.id,
        userId
      })
      throw createBadRequestError('ASSIGNEE_NOT_IN_BOARD')
    }

    return user
  }

  private assertColumnBelongsToBoard(board: BoardRecord, columnId: string) {
    if (board.columns.some((column) => column.id === columnId)) {
      return
    }

    logger.warn('Column does not belong to board', {
      boardId: board.id,
      columnId
    })
    throw createBadRequestError('BOARD_COLUMN_NOT_FOUND')
  }

  private assertTaskBoardAccess(actor: RequestUser, task: TaskRecord) {
    if (actor.role === 'admin') {
      return
    }

    const isParticipant =
      task.boardOwnerId === actor.id || task.boardMemberUserIds.includes(actor.id)

    if (!isParticipant) {
      logger.warn('Task operation rejected because actor has no board access', {
        actorId: actor.id,
        boardId: task.boardId,
        ownerId: task.boardOwnerId
      })
      throw createForbiddenError('TASK_FORBIDDEN')
    }
  }
}
