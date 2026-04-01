import { randomBytes } from 'node:crypto'
import { createLogger } from '@scrumbun/config'
import {
  boardColorPalette,
  boardSchema,
  defaultBoardColumns,
  type AddBoardMemberInput,
  type CreateBoardColumnInput,
  type CreateBoardInput,
  type DeleteBoardColumnInput,
  type JoinBoardByInviteCodeInput,
  type UpdateBoardMemberColorInput,
  type UpdateBoardColumnInput,
  type UpdateBoardInput
} from '@scrumbun/shared/tasks'
import type { RequestUser } from '../../../shared/http/auth'
import {
  assertCanManageBoard,
  assertCanReadBoard,
  canManageBoard,
  createBadRequestError,
  createNotFoundError
} from '../../../shared/http/authorization'
import type { UsersRepository } from '../../users/repositories/users-repository'
import type {
  BoardColumnRecord,
  BoardMemberRecord,
  BoardRecord,
  BoardsRepository
} from '../repositories/boards-repository'

const logger = createLogger('apps/api/boards-service')
const inviteCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const inviteCodeLength = 8

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function mapBoardMemberDto(member: BoardMemberRecord) {
  return {
    boardId: member.boardId,
    userId: member.userId,
    color: member.color,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
    user: {
      ...member.user,
      emailVerifiedAt: member.user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: member.user.createdAt.toISOString(),
      updatedAt: member.user.updatedAt.toISOString()
    }
  }
}

function mapBoardColumnDto(column: BoardColumnRecord) {
  return {
    id: column.id,
    boardId: column.boardId,
    name: column.name,
    slug: column.slug,
    color: column.color,
    position: column.position,
    createdAt: column.createdAt.toISOString(),
    updatedAt: column.updatedAt.toISOString()
  }
}

function pickNextBoardColor(
  usedColors: string[],
  preferredPalette: readonly string[] = boardColorPalette
) {
  return preferredPalette.find((color) => !usedColors.includes(color)) ?? preferredPalette[usedColors.length % preferredPalette.length]
}

function normalizeInviteCode(inviteCode: string) {
  return inviteCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function generateInviteCodeCandidate() {
  const bytes = randomBytes(inviteCodeLength)

  return Array.from(bytes, (byte) => inviteCodeAlphabet[byte % inviteCodeAlphabet.length]).join('')
}

function mapBoardDto(board: BoardRecord, actor?: RequestUser) {
  return boardSchema.parse({
    id: board.id,
    name: board.name,
    slug: board.slug,
    inviteCode: actor && canManageBoard(actor, board) ? board.inviteCode : null,
    description: board.description,
    ownerId: board.ownerId,
    archivedAt: board.archivedAt?.toISOString() ?? null,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
    members: board.members.map(mapBoardMemberDto),
    columns: board.columns.map(mapBoardColumnDto)
  })
}

export class BoardsService {
  constructor(
    private readonly repository: BoardsRepository,
    private readonly usersRepository: UsersRepository
  ) {}

  async listBoards(actor: RequestUser, includeArchived: boolean) {
    logger.debug('Listing boards', {
      actorId: actor.id,
      role: actor.role,
      includeArchived
    })

    const boards = await this.repository.listBoards({
      actorId: actor.id,
      includeArchived,
      includeAll: actor.role === 'admin'
    })

    logger.info('Boards listed successfully', {
      actorId: actor.id,
      count: boards.length
    })

    return boards.map((board) => mapBoardDto(board, actor))
  }

  async getBoard(actor: RequestUser, boardId: string) {
    const board = await this.requireBoard(boardId)
    assertCanReadBoard(actor, board)
    return mapBoardDto(board, actor)
  }

  async createBoard(actor: RequestUser, input: CreateBoardInput) {
    logger.debug('Creating board', {
      actorId: actor.id,
      slug: input.slug
    })

    const inviteCode = await this.generateUniqueInviteCode()
    const board = await this.repository.createBoard({
      ...input,
      inviteCode,
      ownerId: actor.id,
      ownerColor: pickNextBoardColor([]),
      description: input.description ?? null,
      defaultColumns: defaultBoardColumns.map((column) => ({
        name: column.name,
        slug: column.slug,
        color: column.color
      }))
    })

    logger.info('Board created successfully', {
      actorId: actor.id,
      boardId: board.id,
      columnCount: board.columns.length
    })

    return mapBoardDto(board, actor)
  }

  async updateBoard(actor: RequestUser, boardId: string, input: UpdateBoardInput) {
    const board = await this.requireBoard(boardId)
    assertCanManageBoard(actor, board)

    if (board.archivedAt && actor.role !== 'admin') {
      throw createBadRequestError('BOARD_ARCHIVED')
    }

    const updatedBoard = await this.repository.updateBoard(boardId, input)

    logger.info('Board updated successfully', {
      actorId: actor.id,
      boardId
    })

    return mapBoardDto(updatedBoard, actor)
  }

  async setBoardArchived(actor: RequestUser, boardId: string, archived: boolean) {
    const board = await this.requireBoard(boardId)
    assertCanManageBoard(actor, board)

    logger.info('Changing board archive state', {
      actorId: actor.id,
      boardId,
      archived
    })

    const updatedBoard = await this.repository.setBoardArchived(boardId, {
      archived,
      actorId: actor.id
    })

    return mapBoardDto(updatedBoard, actor)
  }

  async addBoardMember(actor: RequestUser, boardId: string, input: AddBoardMemberInput) {
    const board = await this.requireBoard(boardId)
    assertCanManageBoard(actor, board)

    if (board.ownerId === input.userId) {
      throw createBadRequestError('BOARD_OWNER_ALREADY_INCLUDED')
    }

    if (board.members.some((member) => member.userId === input.userId)) {
      throw createBadRequestError('BOARD_MEMBER_ALREADY_EXISTS')
    }

    const user = await this.usersRepository.findUserById(input.userId)

    if (!user) {
      throw createNotFoundError('USER_NOT_FOUND')
    }

    logger.info('Adding board member', {
      actorId: actor.id,
      boardId,
      memberUserId: input.userId
    })

    return mapBoardDto(
      await this.repository.addBoardMember(
        boardId,
        input.userId,
        pickNextBoardColor(board.members.map((member) => member.color))
      ),
      actor
    )
  }

  async removeBoardMember(actor: RequestUser, boardId: string, userId: string) {
    const board = await this.requireBoard(boardId)
    assertCanManageBoard(actor, board)

    if (board.ownerId === userId) {
      throw createBadRequestError('BOARD_OWNER_CANNOT_BE_REMOVED')
    }

    if (!board.members.some((member) => member.userId === userId)) {
      throw createNotFoundError('BOARD_MEMBER_NOT_FOUND')
    }

    logger.info('Removing board member', {
      actorId: actor.id,
      boardId,
      memberUserId: userId
    })

    return mapBoardDto(await this.repository.removeBoardMember(boardId, userId), actor)
  }

  async joinBoardByInviteCode(actor: RequestUser, input: JoinBoardByInviteCodeInput) {
    const inviteCode = normalizeInviteCode(input.inviteCode)

    if (!inviteCode) {
      throw createBadRequestError('BOARD_INVITE_CODE_INVALID')
    }

    const board = await this.repository.findBoardByInviteCode(inviteCode)

    if (!board) {
      throw createNotFoundError('BOARD_INVITE_CODE_NOT_FOUND')
    }

    if (board.archivedAt) {
      throw createBadRequestError('BOARD_ARCHIVED')
    }

    if (board.ownerId === actor.id || board.members.some((member) => member.userId === actor.id)) {
      throw createBadRequestError('BOARD_MEMBER_ALREADY_EXISTS')
    }

    logger.info('Joining board by invite code', {
      actorId: actor.id,
      boardId: board.id
    })

    return mapBoardDto(
      await this.repository.addBoardMember(
        board.id,
        actor.id,
        pickNextBoardColor(board.members.map((member) => member.color))
      ),
      actor
    )
  }

  async updateBoardMemberColor(
    actor: RequestUser,
    boardId: string,
    userId: string,
    input: UpdateBoardMemberColorInput
  ) {
    const board = await this.requireBoard(boardId)
    assertCanManageBoard(actor, board)

    if (!board.members.some((member) => member.userId === userId)) {
      throw createNotFoundError('BOARD_MEMBER_NOT_FOUND')
    }

    logger.info('Updating board member color', {
      actorId: actor.id,
      boardId,
      memberUserId: userId
    })

    return mapBoardDto(await this.repository.updateBoardMemberColor(boardId, userId, input.color), actor)
  }

  async regenerateBoardInviteCode(actor: RequestUser, boardId: string) {
    const board = await this.requireBoard(boardId)
    assertCanManageBoard(actor, board)

    const inviteCode = await this.generateUniqueInviteCode(board.inviteCode)

    logger.info('Regenerating board invite code', {
      actorId: actor.id,
      boardId
    })

    return mapBoardDto(await this.repository.updateBoardInviteCode(boardId, inviteCode), actor)
  }

  async createBoardColumn(actor: RequestUser, boardId: string, input: CreateBoardColumnInput) {
    const board = await this.requireBoard(boardId)
    assertCanManageBoard(actor, board)

    const nextSlug = input.slug?.trim() || slugify(input.name)

    if (board.columns.some((column) => column.slug === nextSlug)) {
      throw createBadRequestError('BOARD_COLUMN_SLUG_CONFLICT')
    }

    logger.info('Creating board column', {
      actorId: actor.id,
      boardId,
      slug: nextSlug
    })

    return mapBoardDto(
      await this.repository.createBoardColumn(boardId, {
        name: input.name.trim(),
        slug: nextSlug,
        color: input.color ?? pickNextBoardColor(board.columns.map((column) => column.color))
      }),
      actor
    )
  }

  async updateBoardColumn(
    actor: RequestUser,
    boardId: string,
    columnId: string,
    input: UpdateBoardColumnInput
  ) {
    const board = await this.requireBoard(boardId)
    assertCanManageBoard(actor, board)

    const currentColumn = board.columns.find((column) => column.id === columnId)

    if (!currentColumn) {
      throw createNotFoundError('BOARD_COLUMN_NOT_FOUND')
    }

    const nextSlug = input.slug?.trim() ?? (input.name ? slugify(input.name) : currentColumn.slug)

    if (board.columns.some((column) => column.id !== columnId && column.slug === nextSlug)) {
      throw createBadRequestError('BOARD_COLUMN_SLUG_CONFLICT')
    }

    logger.info('Updating board column', {
      actorId: actor.id,
      boardId,
      columnId
    })

    return mapBoardDto(
      await this.repository.updateBoardColumn(boardId, columnId, {
        name: input.name?.trim(),
        slug: nextSlug,
        color: input.color ?? currentColumn.color
      }),
      actor
    )
  }

  async reorderBoardColumns(actor: RequestUser, boardId: string, columnIds: string[]) {
    const board = await this.requireBoard(boardId)
    assertCanManageBoard(actor, board)

    if (columnIds.length !== board.columns.length) {
      throw createBadRequestError('BOARD_COLUMN_REORDER_INVALID')
    }

    const existingIds = new Set(board.columns.map((column) => column.id))
    const nextIds = new Set(columnIds)

    if (existingIds.size !== nextIds.size || columnIds.some((columnId) => !existingIds.has(columnId))) {
      throw createBadRequestError('BOARD_COLUMN_REORDER_INVALID')
    }

    logger.info('Reordering board columns', {
      actorId: actor.id,
      boardId,
      columnCount: columnIds.length
    })

    return mapBoardDto(await this.repository.reorderBoardColumns(boardId, columnIds), actor)
  }

  async deleteBoardColumn(
    actor: RequestUser,
    boardId: string,
    columnId: string,
    input: DeleteBoardColumnInput
  ) {
    const board = await this.requireBoard(boardId)
    assertCanManageBoard(actor, board)

    if (board.columns.length <= 1) {
      throw createBadRequestError('BOARD_LAST_COLUMN')
    }

    const currentColumn = board.columns.find((column) => column.id === columnId)

    if (!currentColumn) {
      throw createNotFoundError('BOARD_COLUMN_NOT_FOUND')
    }

    if (input.destinationColumnId && !board.columns.some((column) => column.id === input.destinationColumnId)) {
      throw createBadRequestError('BOARD_COLUMN_DESTINATION_INVALID')
    }

    if (input.destinationColumnId === columnId) {
      throw createBadRequestError('BOARD_COLUMN_DESTINATION_INVALID')
    }

    logger.info('Deleting board column', {
      actorId: actor.id,
      boardId,
      columnId,
      destinationColumnId: input.destinationColumnId ?? null
    })

    try {
      return mapBoardDto(
        await this.repository.deleteBoardColumn(boardId, columnId, input.destinationColumnId),
        actor
      )
    } catch (error) {
      if (error instanceof Error && error.message === 'COLUMN_HAS_TASKS') {
        throw createBadRequestError('BOARD_COLUMN_HAS_TASKS')
      }

      throw error
    }
  }

  async deleteBoard(actor: RequestUser, boardId: string) {
    const board = await this.requireBoard(boardId)
    assertCanManageBoard(actor, board)

    logger.warn('Permanently deleting board', {
      actorId: actor.id,
      boardId,
      memberCount: board.members.length,
      columnCount: board.columns.length
    })

    await this.repository.deleteBoard(boardId)
  }

  private async requireBoard(boardId: string) {
    const board = await this.repository.findBoardById(boardId)

    if (!board) {
      logger.warn('Board not found', {
        boardId
      })
      throw createNotFoundError('BOARD_NOT_FOUND')
    }

    return board
  }

  private async generateUniqueInviteCode(previousInviteCode?: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = generateInviteCodeCandidate()

      if (candidate === previousInviteCode) {
        continue
      }

      const existingBoard = await this.repository.findBoardByInviteCode(candidate)

      if (!existingBoard) {
        return candidate
      }
    }

    throw createBadRequestError('BOARD_INVITE_CODE_GENERATION_FAILED')
  }
}
