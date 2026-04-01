import { z } from 'zod';
import {
  moderateBoardArchiveSchema,
  moderateTaskArchiveSchema,
  moderateTaskAssignmentSchema,
  moderateTaskColumnSchema
} from '@scrumbun/shared/admin';

export {
  moderateBoardArchiveSchema,
  moderateTaskArchiveSchema,
  moderateTaskAssignmentSchema,
  moderateTaskColumnSchema
};

export const boardParamsSchema = z.object({
  boardId: z.string()
});

export const taskParamsSchema = z.object({
  taskId: z.string()
});
