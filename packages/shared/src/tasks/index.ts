import { z } from 'zod'
import { userSchema } from '../auth'

const dateTimeSchema = z.string().datetime()
export const boardColorSchema = z.string().regex(/^#[0-9A-F]{6}$/i, 'Color must be a hex value')

export const boardColorPalette = [
  '#F97316',
  '#14B8A6',
  '#38BDF8',
  '#A78BFA',
  '#F43F5E',
  '#EAB308',
  '#22C55E',
  '#FB7185'
] as const

export const boardMemberSchema = z.object({
  boardId: z.string(),
  userId: z.string(),
  color: boardColorSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  user: userSchema
})

export const boardColumnSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
  color: boardColorSchema,
  position: z.number().int().nonnegative(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema
})

export const boardSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
  inviteCode: z.string().min(6).max(32).nullable(),
  description: z.string().max(5000).nullable(),
  ownerId: z.string().nullable(),
  archivedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  members: z.array(boardMemberSchema),
  columns: z.array(boardColumnSchema)
})

export const taskSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  columnId: z.string(),
  title: z.string().min(1).max(160),
  description: z.string().max(5000).nullable(),
  dueDate: dateTimeSchema.nullable(),
  assigneeId: z.string().nullable(),
  createdById: z.string().nullable(),
  archivedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema
})

export const createBoardSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
  description: z.string().max(5000).optional()
})

export const updateBoardSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    slug: z.string().min(1).max(120).optional(),
    description: z.string().max(5000).nullable().optional()
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one board field must be provided'
  })

export const archiveBoardSchema = z.object({
  archived: z.boolean()
})

export const deleteBoardSchema = z.object({
  delete: z.literal(true)
})

export const addBoardMemberSchema = z.object({
  userId: z.string()
})

export const updateBoardMemberColorSchema = z.object({
  color: boardColorSchema
})

export const joinBoardByInviteCodeSchema = z.object({
  inviteCode: z.string().min(6).max(32)
})

export const removeBoardMemberSchema = z.object({
  userId: z.string()
})

export const createBoardColumnSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).optional(),
  color: boardColorSchema.optional()
})

export const updateBoardColumnSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    slug: z.string().min(1).max(120).optional(),
    color: boardColorSchema.optional()
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one board column field must be provided'
  })

export const reorderBoardColumnsSchema = z.object({
  columnIds: z.array(z.string()).min(1)
})

export const deleteBoardColumnSchema = z.object({
  destinationColumnId: z.string().optional()
})

export const createTaskSchema = z.object({
  boardId: z.string(),
  columnId: z.string().optional(),
  title: z.string().min(1).max(160),
  description: z.string().max(5000).optional(),
  dueDate: dateTimeSchema.optional(),
  assigneeId: z.string().optional()
})

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(160).optional(),
    description: z.string().max(5000).nullable().optional(),
    dueDate: dateTimeSchema.nullable().optional(),
    assigneeId: z.string().nullable().optional()
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one task field must be provided'
  })

export const updateTaskColumnSchema = z.object({
  columnId: z.string()
})

export const updateTaskAssignmentSchema = z.object({
  assigneeId: z.string().nullable()
})

export const archiveTaskSchema = z.object({
  archived: z.boolean()
})

export const deleteTaskSchema = z.object({
  delete: z.literal(true)
})

export const defaultBoardColumns = [
  { name: 'Бэклог', slug: 'backlog', color: '#6B7280' },
  { name: 'Готово к работе', slug: 'ready', color: '#0EA5E9' },
  { name: 'В работе', slug: 'in-progress', color: '#F97316' },
  { name: 'Ревью', slug: 'review', color: '#A855F7' },
  { name: 'Тестирование', slug: 'testing', color: '#EAB308' },
  { name: 'Готово', slug: 'done', color: '#22C55E' }
] as const

export type BoardMemberDto = z.infer<typeof boardMemberSchema>
export type BoardColumnDto = z.infer<typeof boardColumnSchema>
export type BoardDto = z.infer<typeof boardSchema>
export type TaskDto = z.infer<typeof taskSchema>
export type CreateBoardInput = z.infer<typeof createBoardSchema>
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>
export type ArchiveBoardInput = z.infer<typeof archiveBoardSchema>
export type DeleteBoardInput = z.infer<typeof deleteBoardSchema>
export type AddBoardMemberInput = z.infer<typeof addBoardMemberSchema>
export type UpdateBoardMemberColorInput = z.infer<typeof updateBoardMemberColorSchema>
export type JoinBoardByInviteCodeInput = z.infer<typeof joinBoardByInviteCodeSchema>
export type RemoveBoardMemberInput = z.infer<typeof removeBoardMemberSchema>
export type CreateBoardColumnInput = z.infer<typeof createBoardColumnSchema>
export type UpdateBoardColumnInput = z.infer<typeof updateBoardColumnSchema>
export type ReorderBoardColumnsInput = z.infer<typeof reorderBoardColumnsSchema>
export type DeleteBoardColumnInput = z.infer<typeof deleteBoardColumnSchema>
export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>
export type UpdateTaskColumnInput = z.infer<typeof updateTaskColumnSchema>
export type UpdateTaskAssignmentInput = z.infer<typeof updateTaskAssignmentSchema>
export type ArchiveTaskInput = z.infer<typeof archiveTaskSchema>
export type DeleteTaskInput = z.infer<typeof deleteTaskSchema>
