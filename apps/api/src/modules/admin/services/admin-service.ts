import { createLogger } from '@scrumbun/config'
import { moderationOverviewSchema } from '@scrumbun/shared/admin'
import type {
  ModerateBoardArchiveInput,
  ModerateTaskAssignmentInput,
  ModerateTaskArchiveInput,
  ModerateTaskColumnInput
} from '@scrumbun/shared/admin'
import { boardSchema, taskSchema } from '@scrumbun/shared/tasks'
import { createNotFoundError } from '../../../shared/http/authorization'
import type { AdminRepository } from '../repositories/admin-repository'

const logger = createLogger('apps/api/admin-service')

function mapBoardDto(board: {
  id: string
  name: string
  slug: string
  description: string | null
  ownerId: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  members: Array<{
    boardId: string
    userId: string
    color: string
    createdAt: Date
    updatedAt: Date
    user: {
      id: string
      email: string
      displayName: string
      role: 'user' | 'admin'
      emailVerificationStatus: 'pending' | 'verified'
      emailVerifiedAt: Date | null
      createdAt: Date
      updatedAt: Date
    }
  }>
  columns: Array<{
    id: string
    boardId: string
    name: string
    slug: string
    color: string
    position: number
    createdAt: Date
    updatedAt: Date
  }>
}) {
  return boardSchema.parse({
    ...board,
    archivedAt: board.archivedAt?.toISOString() ?? null,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
    members: board.members.map((member) => ({
      ...member,
      createdAt: member.createdAt.toISOString(),
      updatedAt: member.updatedAt.toISOString(),
      user: {
        ...member.user,
        emailVerifiedAt: member.user.emailVerifiedAt?.toISOString() ?? null,
        createdAt: member.user.createdAt.toISOString(),
        updatedAt: member.user.updatedAt.toISOString()
      }
    })),
    columns: board.columns.map((column) => ({
      ...column,
      createdAt: column.createdAt.toISOString(),
      updatedAt: column.updatedAt.toISOString()
    }))
  })
}

function mapTaskDto(task: {
  id: string
  boardId: string
  columnId: string
  title: string
  description: string | null
  dueDate: Date | null
  assigneeId: string | null
  createdById: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return taskSchema.parse({
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  })
}

export class AdminService {
  constructor(private readonly repository: AdminRepository) {}

  async getOverview() {
    logger.debug('Fetching moderation overview')

    const overview = await this.repository.getOverview()

    logger.info('Moderation overview ready', {
      archivedBoards: overview.counts.archivedBoards,
      archivedTasks: overview.counts.archivedTasks
    })

    return moderationOverviewSchema.parse({
      counts: overview.counts,
      archivedBoards: overview.archivedBoards.map(mapBoardDto),
      archivedTasks: overview.archivedTasks.map(mapTaskDto),
      users: overview.users.map((user) => ({
        ...user,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      }))
    })
  }

  async setBoardArchived(actorId: string, boardId: string, input: ModerateBoardArchiveInput) {
    logger.info('Admin changing board archive state', {
      actorId,
      boardId,
      archived: input.archived
    })

    try {
      return mapBoardDto(await this.repository.setBoardArchived(boardId, input.archived, actorId))
    } catch {
      throw createNotFoundError('BOARD_NOT_FOUND')
    }
  }

  async deleteBoard(boardId: string) {
    logger.warn('Admin permanently deleting board', {
      boardId
    })

    try {
      await this.repository.deleteBoard(boardId)
    } catch {
      throw createNotFoundError('BOARD_NOT_FOUND')
    }
  }

  async setTaskArchived(actorId: string, taskId: string, input: ModerateTaskArchiveInput) {
    logger.info('Admin changing task archive state', {
      actorId,
      taskId,
      archived: input.archived
    })

    try {
      return mapTaskDto(await this.repository.setTaskArchived(taskId, input.archived, actorId))
    } catch {
      throw createNotFoundError('TASK_NOT_FOUND')
    }
  }

  async deleteTask(taskId: string) {
    logger.warn('Admin permanently deleting task', {
      taskId
    })

    try {
      await this.repository.deleteTask(taskId)
    } catch {
      throw createNotFoundError('TASK_NOT_FOUND')
    }
  }

  async setTaskAssignment(taskId: string, input: ModerateTaskAssignmentInput) {
    logger.info('Admin reassigning task', {
      taskId,
      assigneeId: input.assigneeId
    })

    try {
      return mapTaskDto(await this.repository.setTaskAssignment(taskId, input.assigneeId))
    } catch {
      throw createNotFoundError('TASK_NOT_FOUND')
    }
  }

  async setTaskColumn(taskId: string, input: ModerateTaskColumnInput) {
    logger.info('Admin moving task to column', {
      taskId,
      columnId: input.columnId
    })

    try {
      return mapTaskDto(await this.repository.setTaskColumn(taskId, input.columnId))
    } catch {
      throw createNotFoundError('TASK_NOT_FOUND')
    }
  }
}
