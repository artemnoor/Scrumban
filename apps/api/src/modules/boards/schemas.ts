import { z } from 'zod'
import {
  addBoardMemberSchema,
  archiveBoardSchema,
  createBoardColumnSchema,
  createBoardSchema,
  deleteBoardColumnSchema,
  joinBoardByInviteCodeSchema,
  reorderBoardColumnsSchema,
  updateBoardMemberColorSchema,
  updateBoardColumnSchema,
  updateBoardSchema
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
  addBoardMemberSchema,
  archiveBoardSchema,
  createBoardColumnSchema,
  createBoardSchema,
  deleteBoardColumnSchema,
  joinBoardByInviteCodeSchema,
  reorderBoardColumnsSchema,
  updateBoardMemberColorSchema,
  updateBoardColumnSchema,
  updateBoardSchema
}

export const boardParamsSchema = z.object({
  boardId: z.string()
})

export const boardMemberParamsSchema = z.object({
  boardId: z.string(),
  userId: z.string()
})

export const boardColumnParamsSchema = z.object({
  boardId: z.string(),
  columnId: z.string()
})

export const listBoardsQuerySchema = z.object({
  includeArchived: optionalBooleanQuery(false)
})
