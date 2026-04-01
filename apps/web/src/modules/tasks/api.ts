import { z } from 'zod'
import {
  archiveTaskSchema,
  createTaskSchema,
  taskSchema,
  updateTaskAssignmentSchema,
  updateTaskColumnSchema,
  updateTaskSchema,
  type ArchiveTaskInput,
  type CreateTaskInput,
  type TaskDto,
  type UpdateTaskAssignmentInput,
  type UpdateTaskColumnInput,
  type UpdateTaskInput
} from '@scrumbun/shared/tasks'
import { apiRequest } from '../../shared/http/api-client'
import { createBrowserLogger } from '../../shared/logger'

const logger = createBrowserLogger('apps/web/tasks-api')
const taskListSchema = z.array(taskSchema)

export async function listTasks(boardId: string, includeArchived = false): Promise<TaskDto[]> {
  logger.debug('Listing tasks from frontend', {
    boardId,
    includeArchived
  })

  return apiRequest<TaskDto[]>(`/tasks?boardId=${boardId}&includeArchived=${includeArchived}`, {
    schema: taskListSchema
  })
}

export async function createTask(input: CreateTaskInput): Promise<TaskDto> {
  const payload = createTaskSchema.parse(input)

  logger.info('Creating task from frontend', {
    boardId: payload.boardId,
    title: payload.title,
    columnId: payload.columnId ?? null
  })

  return apiRequest<TaskDto, CreateTaskInput>('/tasks', {
    method: 'POST',
    body: payload,
    schema: taskSchema
  })
}

export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<TaskDto> {
  const payload = updateTaskSchema.parse(input)

  logger.info('Updating task details from frontend', {
    taskId
  })

  return apiRequest<TaskDto, UpdateTaskInput>(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: payload,
    schema: taskSchema
  })
}

export async function updateTaskColumn(
  taskId: string,
  input: UpdateTaskColumnInput
): Promise<TaskDto> {
  const payload = updateTaskColumnSchema.parse(input)

  logger.info('Updating task column from frontend', {
    taskId,
    columnId: payload.columnId
  })

  return apiRequest<TaskDto, UpdateTaskColumnInput>(`/tasks/${taskId}/column`, {
    method: 'POST',
    body: payload,
    schema: taskSchema
  })
}

export async function updateTaskAssignment(
  taskId: string,
  input: UpdateTaskAssignmentInput
): Promise<TaskDto> {
  const payload = updateTaskAssignmentSchema.parse(input)

  logger.info('Updating task assignee from frontend', {
    taskId,
    assigneeId: payload.assigneeId
  })

  return apiRequest<TaskDto, UpdateTaskAssignmentInput>(`/tasks/${taskId}/assignee`, {
    method: 'POST',
    body: payload,
    schema: taskSchema
  })
}

export async function setTaskArchived(
  taskId: string,
  input: ArchiveTaskInput
): Promise<TaskDto> {
  const payload = archiveTaskSchema.parse(input)

  logger.info('Changing task archive state from frontend', {
    taskId,
    archived: payload.archived
  })

  return apiRequest<TaskDto, ArchiveTaskInput>(`/tasks/${taskId}/archive`, {
    method: 'POST',
    body: payload,
    schema: taskSchema
  })
}

export async function deleteTask(taskId: string): Promise<void> {
  logger.warn('Deleting task permanently from frontend', {
    taskId
  })

  return apiRequest<void>(`/tasks/${taskId}`, {
    method: 'DELETE'
  })
}
