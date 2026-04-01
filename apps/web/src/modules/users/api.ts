import { z } from 'zod';
import { userSchema, type UserDto } from '@scrumbun/shared/auth';
import { apiRequest } from '../../shared/http/api-client';
import { createBrowserLogger } from '../../shared/logger';

const logger = createBrowserLogger('apps/web/users-api');
const userListSchema = z.array(userSchema);

export async function listUsers(): Promise<UserDto[]> {
  logger.debug('Listing users from frontend');

  return apiRequest<UserDto[]>('/users', {
    schema: userListSchema
  });
}
