import {
  moderationOverviewSchema,
  moderateBoardArchiveSchema,
  moderateTaskArchiveSchema,
  moderateTaskAssignmentSchema,
  moderateTaskColumnSchema,
  type ModerateBoardArchiveInput,
  type ModerateTaskArchiveInput,
  type ModerateTaskAssignmentInput,
  type ModerateTaskColumnInput,
  type ModerationOverviewDto
} from '@scrumbun/shared/admin'
import { boardSchema, taskSchema, type BoardDto, type TaskDto } from '@scrumbun/shared/tasks'
import { apiRequest } from '../../shared/http/api-client'
import { createBrowserLogger } from '../../shared/logger'

const logger = createBrowserLogger('apps/web/admin-api')

export async function getModerationOverview(): Promise<ModerationOverviewDto> {
  logger.debug('Fetching moderation overview from frontend')

  return apiRequest<ModerationOverviewDto>('/admin/overview', {
    schema: moderationOverviewSchema
  })
}

export async function adminSetBoardArchived(
  boardId: string,
  input: ModerateBoardArchiveInput
): Promise<BoardDto> {
  const payload = moderateBoardArchiveSchema.parse(input)

  logger.info('Admin toggling board archive state from frontend', {
    boardId,
    archived: payload.archived
  })

  return apiRequest<BoardDto, ModerateBoardArchiveInput>(`/admin/boards/${boardId}/archive`, {
    method: 'POST',
    body: payload,
    schema: boardSchema
  })
}

export async function adminDeleteBoard(boardId: string): Promise<void> {
  logger.warn('Admin deleting board permanently from frontend', {
    boardId
  })

  return apiRequest<void>(`/admin/boards/${boardId}`, {
    method: 'DELETE'
  })
}

export async function adminSetTaskArchived(
  taskId: string,
  input: ModerateTaskArchiveInput
): Promise<TaskDto> {
  const payload = moderateTaskArchiveSchema.parse(input)

  logger.info('Admin toggling task archive state from frontend', {
    taskId,
    archived: payload.archived
  })

  return apiRequest<TaskDto, ModerateTaskArchiveInput>(`/admin/tasks/${taskId}/archive`, {
    method: 'POST',
    body: payload,
    schema: taskSchema
  })
}

export async function adminDeleteTask(taskId: string): Promise<void> {
  logger.warn('Admin deleting task permanently from frontend', {
    taskId
  })

  return apiRequest<void>(`/admin/tasks/${taskId}`, {
    method: 'DELETE'
  })
}

export async function adminSetTaskAssignment(
  taskId: string,
  input: ModerateTaskAssignmentInput
): Promise<TaskDto> {
  const payload = moderateTaskAssignmentSchema.parse(input)

  logger.info('Admin changing task assignee from frontend', {
    taskId,
    assigneeId: payload.assigneeId
  })

  return apiRequest<TaskDto, ModerateTaskAssignmentInput>(`/admin/tasks/${taskId}/assignee`, {
    method: 'POST',
    body: payload,
    schema: taskSchema
  })
}

export async function adminSetTaskColumn(
  taskId: string,
  input: ModerateTaskColumnInput
): Promise<TaskDto> {
  const payload = moderateTaskColumnSchema.parse(input)

  logger.info('Admin changing task column from frontend', {
    taskId,
    columnId: payload.columnId
  })

  return apiRequest<TaskDto, ModerateTaskColumnInput>(`/admin/tasks/${taskId}/column`, {
    method: 'POST',
    body: payload,
    schema: taskSchema
  })
}
