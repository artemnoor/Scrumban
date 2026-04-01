import { z } from 'zod'
import {
  archiveTaskSchema,
  createTaskSchema,
  updateTaskAssignmentSchema,
  updateTaskColumnSchema,
  updateTaskSchema
} from '@scrumbun/shared/tasks'

function optionalBooleanQuery(defaultValue: boolean) {
  return z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return defaultValue
      }

      return value === true || value === 'true'
    })
}

export {
  archiveTaskSchema,
  createTaskSchema,
  updateTaskAssignmentSchema,
  updateTaskColumnSchema,
  updateTaskSchema
}

export const taskParamsSchema = z.object({
  taskId: z.string()
})

export const listTasksQuerySchema = z.object({
  boardId: z.string(),
  includeArchived: optionalBooleanQuery(false)
})
