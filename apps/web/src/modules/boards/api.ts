import { z } from 'zod'
import {
  addBoardMemberSchema,
  boardSchema,
  createBoardColumnSchema,
  createBoardSchema,
  deleteBoardColumnSchema,
  joinBoardByInviteCodeSchema,
  reorderBoardColumnsSchema,
  updateBoardMemberColorSchema,
  updateBoardColumnSchema,
  updateBoardSchema,
  archiveBoardSchema,
  type AddBoardMemberInput,
  type BoardDto,
  type CreateBoardColumnInput,
  type CreateBoardInput,
  type DeleteBoardColumnInput,
  type JoinBoardByInviteCodeInput,
  type UpdateBoardMemberColorInput,
  type UpdateBoardColumnInput,
  type UpdateBoardInput,
  type ArchiveBoardInput
} from '@scrumbun/shared/tasks'
import { apiRequest } from '../../shared/http/api-client'
import { createBrowserLogger } from '../../shared/logger'

const logger = createBrowserLogger('apps/web/boards-api')
const boardListSchema = z.array(boardSchema)

export async function listBoards(includeArchived = false): Promise<BoardDto[]> {
  logger.debug('Listing boards from frontend', {
    includeArchived
  })

  return apiRequest<BoardDto[]>(`/boards?includeArchived=${includeArchived}`, {
    schema: boardListSchema
  })
}

export async function createBoard(input: CreateBoardInput): Promise<BoardDto> {
  const payload = createBoardSchema.parse(input)

  logger.info('Creating board from frontend', {
    slug: payload.slug
  })

  return apiRequest<BoardDto, CreateBoardInput>('/boards', {
    method: 'POST',
    body: payload,
    schema: boardSchema
  })
}

export async function updateBoard(boardId: string, input: UpdateBoardInput): Promise<BoardDto> {
  const payload = updateBoardSchema.parse(input)

  logger.info('Updating board from frontend', {
    boardId
  })

  return apiRequest<BoardDto, UpdateBoardInput>(`/boards/${boardId}`, {
    method: 'PATCH',
    body: payload,
    schema: boardSchema
  })
}

export async function setBoardArchived(
  boardId: string,
  input: ArchiveBoardInput
): Promise<BoardDto> {
  const payload = archiveBoardSchema.parse(input)

  logger.info('Changing board archive state from frontend', {
    boardId,
    archived: payload.archived
  })

  return apiRequest<BoardDto, ArchiveBoardInput>(`/boards/${boardId}/archive`, {
    method: 'POST',
    body: payload,
    schema: boardSchema
  })
}

export async function deleteBoard(boardId: string): Promise<void> {
  logger.warn('Deleting board permanently from frontend', {
    boardId
  })

  return apiRequest<void>(`/boards/${boardId}`, {
    method: 'DELETE'
  })
}

export async function addBoardMember(boardId: string, input: AddBoardMemberInput): Promise<BoardDto> {
  const payload = addBoardMemberSchema.parse(input)

  logger.info('Adding board member from frontend', {
    boardId,
    userId: payload.userId
  })

  return apiRequest<BoardDto, AddBoardMemberInput>(`/boards/${boardId}/members`, {
    method: 'POST',
    body: payload,
    schema: boardSchema
  })
}

export async function joinBoardByInviteCode(input: JoinBoardByInviteCodeInput): Promise<BoardDto> {
  const payload = joinBoardByInviteCodeSchema.parse(input)

  logger.info('Joining board by invite code from frontend', {
    inviteCode: payload.inviteCode
  })

  return apiRequest<BoardDto, JoinBoardByInviteCodeInput>('/boards/join', {
    method: 'POST',
    body: payload,
    schema: boardSchema
  })
}

export async function removeBoardMember(boardId: string, userId: string): Promise<BoardDto> {
  logger.info('Removing board member from frontend', {
    boardId,
    userId
  })

  return apiRequest<BoardDto>(`/boards/${boardId}/members/${userId}`, {
    method: 'DELETE',
    schema: boardSchema
  })
}

export async function updateBoardMemberColor(
  boardId: string,
  userId: string,
  input: UpdateBoardMemberColorInput
): Promise<BoardDto> {
  const payload = updateBoardMemberColorSchema.parse(input)

  logger.info('Updating board member color from frontend', {
    boardId,
    userId
  })

  return apiRequest<BoardDto, UpdateBoardMemberColorInput>(`/boards/${boardId}/members/${userId}`, {
    method: 'PATCH',
    body: payload,
    schema: boardSchema
  })
}

export async function regenerateBoardInviteCode(boardId: string): Promise<BoardDto> {
  logger.info('Regenerating board invite code from frontend', {
    boardId
  })

  return apiRequest<BoardDto>(`/boards/${boardId}/invite-code/regenerate`, {
    method: 'POST',
    schema: boardSchema
  })
}

export async function createBoardColumn(
  boardId: string,
  input: CreateBoardColumnInput
): Promise<BoardDto> {
  const payload = createBoardColumnSchema.parse(input)

  logger.info('Creating board column from frontend', {
    boardId,
    slug: payload.slug ?? null
  })

  return apiRequest<BoardDto, CreateBoardColumnInput>(`/boards/${boardId}/columns`, {
    method: 'POST',
    body: payload,
    schema: boardSchema
  })
}

export async function updateBoardColumn(
  boardId: string,
  columnId: string,
  input: UpdateBoardColumnInput
): Promise<BoardDto> {
  const payload = updateBoardColumnSchema.parse(input)

  logger.info('Updating board column from frontend', {
    boardId,
    columnId
  })

  return apiRequest<BoardDto, UpdateBoardColumnInput>(`/boards/${boardId}/columns/${columnId}`, {
    method: 'PATCH',
    body: payload,
    schema: boardSchema
  })
}

export async function reorderBoardColumns(boardId: string, columnIds: string[]): Promise<BoardDto> {
  const payload = reorderBoardColumnsSchema.parse({
    columnIds
  })

  logger.info('Reordering board columns from frontend', {
    boardId,
    columnCount: columnIds.length
  })

  return apiRequest<BoardDto, { columnIds: string[] }>(`/boards/${boardId}/columns/reorder`, {
    method: 'POST',
    body: payload,
    schema: boardSchema
  })
}

export async function deleteBoardColumn(
  boardId: string,
  columnId: string,
  input: DeleteBoardColumnInput
): Promise<BoardDto> {
  const payload = deleteBoardColumnSchema.parse(input)

  logger.warn('Deleting board column from frontend', {
    boardId,
    columnId,
    destinationColumnId: payload.destinationColumnId ?? null
  })

  return apiRequest<BoardDto, DeleteBoardColumnInput>(`/boards/${boardId}/columns/${columnId}/delete`, {
    method: 'POST',
    body: payload,
    schema: boardSchema
  })
}
