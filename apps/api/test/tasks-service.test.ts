import { describe, expect, it } from 'vitest'
import { TasksService } from '../src/modules/tasks/services/tasks-service'
import type { RequestUser } from '../src/shared/http/auth'
import type { BoardRecord, BoardsRepository } from '../src/modules/boards/repositories/boards-repository'
import type { TaskRecord, TasksRepository } from '../src/modules/tasks/repositories/tasks-repository'
import type { UserSummaryRecord, UsersRepository } from '../src/modules/users/repositories/users-repository'

class InMemoryBoardsRepository implements BoardsRepository {
  constructor(private readonly boards: Map<string, BoardRecord>) {}
  async listBoards(input: { actorId: string; includeArchived: boolean; includeAll: boolean }) {
    return Array.from(this.boards.values()).filter((board) => {
      const hasAccess = input.includeAll || board.ownerId === input.actorId || board.members.some((member) => member.userId === input.actorId)
      return hasAccess && (input.includeArchived || board.archivedAt === null)
    })
  }
  async findBoardById(boardId: string) { return this.boards.get(boardId) ?? null }
  async findBoardByInviteCode(_inviteCode: string): Promise<BoardRecord | null> { throw new Error('Not needed') }
  async createBoard(_input: { name: string; slug: string; inviteCode: string; description?: string | null; ownerId: string; defaultColumns: Array<{ name: string; slug: string }> }): Promise<BoardRecord> { throw new Error('Not needed') }
  async updateBoard(_boardId: string, _input: { name?: string; slug?: string; description?: string | null }): Promise<BoardRecord> { throw new Error('Not needed') }
  async setBoardArchived(_boardId: string, _input: { archived: boolean; actorId: string }): Promise<BoardRecord> { throw new Error('Not needed') }
  async addBoardMember(_boardId: string, _userId: string, _color: string): Promise<BoardRecord> { throw new Error('Not needed') }
  async removeBoardMember(_boardId: string, _userId: string): Promise<BoardRecord> { throw new Error('Not needed') }
  async updateBoardMemberColor(_boardId: string, _userId: string, _color: string): Promise<BoardRecord> { throw new Error('Not needed') }
  async updateBoardInviteCode(_boardId: string, _inviteCode: string): Promise<BoardRecord> { throw new Error('Not needed') }
  async createBoardColumn(_boardId: string, _input: { name: string; slug: string; color: string }): Promise<BoardRecord> { throw new Error('Not needed') }
  async updateBoardColumn(_boardId: string, _columnId: string, _input: { name?: string; slug?: string; color?: string }): Promise<BoardRecord> { throw new Error('Not needed') }
  async reorderBoardColumns(_boardId: string, _columnIds: string[]): Promise<BoardRecord> { throw new Error('Not needed') }
  async deleteBoardColumn(_boardId: string, _columnId: string, _destinationColumnId?: string): Promise<BoardRecord> { throw new Error('Not needed') }
  async deleteBoard(_boardId: string) { throw new Error('Not needed') }
}

class InMemoryUsersRepository implements UsersRepository {
  constructor(private readonly users: Map<string, UserSummaryRecord>) {}
  async listUsers() { return Array.from(this.users.values()) }
  async findUserById(id: string) { return this.users.get(id) ?? null }
}

class InMemoryTasksRepository implements TasksRepository {
  private readonly tasks = new Map<string, TaskRecord>()
  private sequence = 1
  constructor(private readonly boards: Map<string, BoardRecord>) {}
  async listTasksByBoard(boardId: string, includeArchived: boolean) {
    return Array.from(this.tasks.values()).filter((task) => task.boardId === boardId && (includeArchived || task.archivedAt === null))
  }
  async findTaskById(taskId: string) { return this.tasks.get(taskId) ?? null }
  async createTask(input: { boardId: string; columnId: string; title: string; description?: string | null; dueDate?: Date | null; assigneeId?: string | null; createdById: string }) {
    const board = this.boards.get(input.boardId)
    if (!board) throw new Error('BOARD_NOT_FOUND')
    const now = new Date()
    const task: TaskRecord = {
      id: `task-${this.sequence++}`,
      boardId: input.boardId,
      columnId: input.columnId,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate ?? null,
      assigneeId: input.assigneeId ?? null,
      createdById: input.createdById,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      boardOwnerId: board.ownerId,
      boardArchivedAt: board.archivedAt,
      boardMemberUserIds: board.members.map((member) => member.userId)
    }
    this.tasks.set(task.id, task)
    return task
  }
  async updateTask(taskId: string, input: { title?: string; description?: string | null; dueDate?: Date | null; assigneeId?: string | null }) {
    const current = this.requireTask(taskId)
    const updated = { ...current, title: input.title ?? current.title, description: input.description === undefined ? current.description : input.description, dueDate: input.dueDate === undefined ? current.dueDate : input.dueDate, assigneeId: input.assigneeId === undefined ? current.assigneeId : input.assigneeId, updatedAt: new Date() }
    this.tasks.set(taskId, updated)
    return updated
  }
  async setTaskColumn(taskId: string, columnId: string) {
    const current = this.requireTask(taskId)
    const updated = { ...current, columnId, updatedAt: new Date() }
    this.tasks.set(taskId, updated)
    return updated
  }
  async setTaskAssignment(taskId: string, assigneeId: string | null) {
    const current = this.requireTask(taskId)
    const updated = { ...current, assigneeId, updatedAt: new Date() }
    this.tasks.set(taskId, updated)
    return updated
  }
  async setTaskArchived(taskId: string, input: { archived: boolean; actorId: string }) {
    const current = this.requireTask(taskId)
    const updated = { ...current, archivedAt: input.archived ? new Date() : null, updatedAt: new Date() }
    this.tasks.set(taskId, updated)
    return updated
  }
  async deleteTask(taskId: string) { this.tasks.delete(taskId) }
  private requireTask(taskId: string) {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error('TASK_NOT_FOUND')
    return task
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

describe('TasksService', () => {
  it('supports create, update, column move, assignment, archive, and delete flows', async () => {
    const now = new Date()
    const board: BoardRecord = {
      id: 'board-1',
      name: 'Platform',
      slug: 'platform',
      inviteCode: 'PLAT1234',
      description: 'Board',
      ownerId: 'owner-1',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      members: [
        { boardId: 'board-1', userId: 'owner-1', color: '#F97316', createdAt: now, updatedAt: now, user: makeUserSummary('owner-1') },
        { boardId: 'board-1', userId: 'assignee-1', color: '#14B8A6', createdAt: now, updatedAt: now, user: makeUserSummary('assignee-1') }
      ],
      columns: [
        { id: 'column-backlog', boardId: 'board-1', name: 'Бэклог', slug: 'backlog', color: '#6B7280', position: 0, createdAt: now, updatedAt: now },
        { id: 'column-doing', boardId: 'board-1', name: 'В работе', slug: 'doing', color: '#F97316', position: 1, createdAt: now, updatedAt: now }
      ]
    }

    const boards = new Map([[board.id, board]])
    const users = new Map([['owner-1', makeUserSummary('owner-1')], ['assignee-1', makeUserSummary('assignee-1')]])
    const service = new TasksService(new InMemoryTasksRepository(boards), new InMemoryBoardsRepository(boards), new InMemoryUsersRepository(users))
    const owner = makeActor({ id: 'owner-1' })

    const createdTask = await service.createTask(owner, {
      boardId: board.id,
      title: 'Implement task workflow',
      description: 'Create the initial task',
      assigneeId: 'assignee-1'
    })

    expect(createdTask.columnId).toBe('column-backlog')
    expect(createdTask.assigneeId).toBe('assignee-1')

    const updatedTask = await service.updateTask(owner, createdTask.id, {
      title: 'Implement updated task workflow',
      description: 'Task description updated'
    })
    expect(updatedTask.title).toBe('Implement updated task workflow')

    const movedTask = await service.updateTaskColumn(owner, createdTask.id, { columnId: 'column-doing' })
    expect(movedTask.columnId).toBe('column-doing')

    const reassignedTask = await service.updateTaskAssignment(owner, createdTask.id, { assigneeId: null })
    expect(reassignedTask.assigneeId).toBeNull()

    const archivedTask = await service.setTaskArchived(owner, createdTask.id, true)
    expect(archivedTask.archivedAt).not.toBeNull()

    await service.deleteTask(owner, createdTask.id)
    const listedTasks = await service.listTasks(owner, board.id, true)
    expect(listedTasks).toHaveLength(0)
  })
})
