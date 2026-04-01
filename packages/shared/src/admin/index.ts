import { z } from 'zod';
import { userSchema } from '../auth';
import { boardSchema, taskSchema } from '../tasks';

export const moderationCountsSchema = z.object({
  activeBoards: z.number().int().nonnegative(),
  archivedBoards: z.number().int().nonnegative(),
  activeTasks: z.number().int().nonnegative(),
  archivedTasks: z.number().int().nonnegative(),
  users: z.number().int().nonnegative(),
  admins: z.number().int().nonnegative()
});

export const moderationOverviewSchema = z.object({
  counts: moderationCountsSchema,
  archivedBoards: z.array(boardSchema),
  archivedTasks: z.array(taskSchema),
  users: z.array(userSchema)
});

export const moderateBoardArchiveSchema = z.object({
  archived: z.boolean()
});

export const moderateTaskArchiveSchema = z.object({
  archived: z.boolean()
});

export const moderateTaskAssignmentSchema = z.object({
  assigneeId: z.string().nullable()
});

export const moderateTaskColumnSchema = z.object({
  columnId: z.string()
});

export type ModerationCountsDto = z.infer<typeof moderationCountsSchema>;
export type ModerationOverviewDto = z.infer<typeof moderationOverviewSchema>;
export type ModerateBoardArchiveInput = z.infer<typeof moderateBoardArchiveSchema>;
export type ModerateTaskArchiveInput = z.infer<typeof moderateTaskArchiveSchema>;
export type ModerateTaskAssignmentInput = z.infer<typeof moderateTaskAssignmentSchema>;
export type ModerateTaskColumnInput = z.infer<typeof moderateTaskColumnSchema>;
