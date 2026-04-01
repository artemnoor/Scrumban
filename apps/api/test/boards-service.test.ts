import { describe, expect, it } from 'vitest'
import { BoardsService } from '../src/modules/boards/services/boards-service'
import type { RequestUser } from '../src/shared/http/auth'
import type { BoardRecord, BoardsRepository } from '../src/modules/boards/repositories/boards-repository'
import type { UserSummaryRecord, UsersRepository } from '../src/modules/users/repositories/users-repository'

class InMemoryUsersRepository implements UsersRepository {
  constructor(private readonly users: Map<string, UserSummaryRecord>) {}
  async listUsers() { return Array.from(this.users.values()) }
  async findUserById(id: string) { return this.users.get(id) ?? null }
}

class InMemoryBoardsRepository implements BoardsRepository {
  private readonly boards = new Map<string, BoardRecord>()
  private boardSequence = 1
  private columnSequence = 1

  async listBoards(input: { actorId: string; includeArchived: boolean; includeAll: boolean }) {
    return Array.from(this.boards.values()).filter((board) => {
      const hasAccess =
        input.includeAll ||
        board.ownerId === input.actorId ||
        board.members.some((member) => member.userId === input.actorId)
      return hasAccess && (input.includeArchived || board.archivedAt === null)
    })
  }

  async findBoardById(boardId: string) {
    return this.boards.get(boardId) ?? null
  }

  async findBoardByInviteCode(inviteCode: string) {
    return Array.from(this.boards.values()).find((board) => board.inviteCode === inviteCode) ?? null
  }

  async createBoard(input: { name: string; slug: string; inviteCode: string; description?: string | null; ownerId: string; ownerColor: string; defaultColumns: Array<{ name: string; slug: string; color: string }> }) {
    const now = new Date()
    const board: BoardRecord = {
      id: `board-${this.boardSequence++}`,
      name: input.name,
      slug: input.slug,
      inviteCode: input.inviteCode,
      description: input.description ?? null,
      ownerId: input.ownerId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      members: [{
        boardId: `board-${this.boardSequence - 1}`,
        userId: input.ownerId,
        color: input.ownerColor,
        createdAt: now,
        updatedAt: now,
        user: {
          id: input.ownerId,
          email: `${input.ownerId}@example.com`,
          displayName: input.ownerId,
          role: 'user' as const,
          emailVerificationStatus: 'verified' as const,
          emailVerifiedAt: now,
          createdAt: now,
          updatedAt: now
        }
      }],
      columns: input.defaultColumns.map((column, position) => ({
        id: `column-${this.columnSequence++}`,
        boardId: `board-${this.boardSequence - 1}`,
        name: column.name,
        slug: column.slug,
        color: column.color,
        position,
        createdAt: now,
        updatedAt: now
      }))
    }
    this.boards.set(board.id, board)
    return board
  }

  async updateBoard(boardId: string, input: { name?: string; slug?: string; description?: string | null }) {
    const board = this.requireBoard(boardId)
    const updated = { ...board, name: input.name ?? board.name, slug: input.slug ?? board.slug, description: input.description === undefined ? board.description : input.description, updatedAt: new Date() }
    this.boards.set(boardId, updated)
    return updated
  }

  async setBoardArchived(boardId: string, input: { archived: boolean; actorId: string }) {
    const board = this.requireBoard(boardId)
    const updated = { ...board, archivedAt: input.archived ? new Date() : null, updatedAt: new Date() }
    this.boards.set(boardId, updated)
    return updated
  }

  async addBoardMember(boardId: string, userId: string, color: string) {
    const board = this.requireBoard(boardId)
    const now = new Date()
    const updated = {
      ...board,
      members: [...board.members, {
        boardId,
        userId,
        color,
        createdAt: now,
        updatedAt: now,
        user: {
          id: userId,
          email: `${userId}@example.com`,
          displayName: userId,
          role: 'user' as const,
          emailVerificationStatus: 'verified' as const,
          emailVerifiedAt: now,
          createdAt: now,
          updatedAt: now
        }
      }],
      updatedAt: now
    }
    this.boards.set(boardId, updated)
    return updated
  }

  async removeBoardMember(boardId: string, userId: string) {
    const board = this.requireBoard(boardId)
    const updated = { ...board, members: board.members.filter((member) => member.userId !== userId), updatedAt: new Date() }
    this.boards.set(boardId, updated)
    return updated
  }

  async updateBoardMemberColor(boardId: string, userId: string, color: string) {
    const board = this.requireBoard(boardId)
    const updated = {
      ...board,
      members: board.members.map((member) =>
        member.userId === userId ? { ...member, color, updatedAt: new Date() } : member
      ),
      updatedAt: new Date()
    }
    this.boards.set(boardId, updated)
    return updated
  }

  async updateBoardInviteCode(boardId: string, inviteCode: string) {
    const board = this.requireBoard(boardId)
    const updated = {
      ...board,
      inviteCode,
      updatedAt: new Date()
    }
    this.boards.set(boardId, updated)
    return updated
  }

  async createBoardColumn(boardId: string, input: { name: string; slug: string; color: string }) {
    const board = this.requireBoard(boardId)
    const now = new Date()
    const updated = {
      ...board,
      columns: [...board.columns, { id: `column-${this.columnSequence++}`, boardId, name: input.name, slug: input.slug, color: input.color, position: board.columns.length, createdAt: now, updatedAt: now }],
      updatedAt: now
    }
    this.boards.set(boardId, updated)
    return updated
  }

  async updateBoardColumn(boardId: string, columnId: string, input: { name?: string; slug?: string; color?: string }) {
    const board = this.requireBoard(boardId)
    const updated = {
      ...board,
      columns: board.columns.map((column) => column.id === columnId ? { ...column, name: input.name ?? column.name, slug: input.slug ?? column.slug, color: input.color ?? column.color, updatedAt: new Date() } : column),
      updatedAt: new Date()
    }
    this.boards.set(boardId, updated)
    return updated
  }

  async reorderBoardColumns(boardId: string, columnIds: string[]) {
    const board = this.requireBoard(boardId)
    const ordered = columnIds.map((columnId, position) => ({ ...board.columns.find((column) => column.id === columnId)!, position, updatedAt: new Date() }))
    const updated = { ...board, columns: ordered, updatedAt: new Date() }
    this.boards.set(boardId, updated)
    return updated
  }

  async deleteBoardColumn(boardId: string, columnId: string, _destinationColumnId?: string) {
    const board = this.requireBoard(boardId)
    const updatedColumns = board.columns.filter((column) => column.id !== columnId).map((column, position) => ({ ...column, position }))
    const updated = { ...board, columns: updatedColumns, updatedAt: new Date() }
    this.boards.set(boardId, updated)
    return updated
  }

  async deleteBoard(boardId: string) {
    this.boards.delete(boardId)
  }

  private requireBoard(boardId: string) {
    const board = this.boards.get(boardId)
    if (!board) throw new Error('BOARD_NOT_FOUND')
    return board
  }
}

function makeActor(input: { id: string; role?: 'user' | 'admin' }): RequestUser {
  const now = new Date()
  return {
    id: input.id,
    email: `${input.id}@example.com`,
    displayName: input.id,
    role: input.role ?? 'user',
    emailVerificationStatus: 'verified',
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now
  }
}

function makeUserSummary(id: string): UserSummaryRecord {
  const now = new Date()
  return {
    id,
    email: `${id}@example.com`,
    displayName: id,
    role: 'user',
    emailVerificationStatus: 'verified',
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now
  }
}

describe('BoardsService', () => {
  it('supports members and columns for board owner', async () => {
    const repository = new InMemoryBoardsRepository()
    const users = new Map([['owner-1', makeUserSummary('owner-1')], ['member-1', makeUserSummary('member-1')]])
    const service = new BoardsService(repository, new InMemoryUsersRepository(users))
    const owner = makeActor({ id: 'owner-1' })
    const outsider = makeActor({ id: 'outsider-1' })

    const createdBoard = await service.createBoard(owner, {
      name: 'Platform',
      slug: 'platform',
      description: 'Board for platform work'
    })

    expect(createdBoard.columns.length).toBeGreaterThan(1)
    expect(createdBoard.members[0]?.color).toMatch(/^#[0-9A-F]{6}$/i)

    const withMember = await service.addBoardMember(owner, createdBoard.id, { userId: 'member-1' })
    expect(withMember.members.some((member) => member.userId === 'member-1')).toBe(true)
    expect(withMember.members.find((member) => member.userId === 'member-1')?.color).toMatch(/^#[0-9A-F]{6}$/i)

    const extraColumn = await service.createBoardColumn(owner, createdBoard.id, { name: 'Blocked' })
    const createdColumn = extraColumn.columns.find((column) => column.name === 'Blocked')
    expect(createdColumn).toBeTruthy()
    expect(createdColumn?.color).toMatch(/^#[0-9A-F]{6}$/i)

    const renamed = await service.updateBoardColumn(owner, createdBoard.id, createdColumn!.id, { name: 'Блокеры', color: '#111111' })
    expect(renamed.columns.find((column) => column.id === createdColumn!.id)?.name).toBe('Блокеры')
    expect(renamed.columns.find((column) => column.id === createdColumn!.id)?.color).toBe('#111111')

    const reordered = await service.reorderBoardColumns(owner, createdBoard.id, renamed.columns.map((column) => column.id).reverse())
    expect(reordered.columns[0]?.id).toBe(createdColumn!.id)

    await expect(service.getBoard(outsider, createdBoard.id)).rejects.toMatchObject({
      message: 'BOARD_FORBIDDEN',
      statusCode: 403
    })
  })
})
