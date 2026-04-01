import { prisma } from '@scrumbun/db'
import type { BoardRecord } from '../../boards/repositories/boards-repository'
import type { TaskRecord } from '../../tasks/repositories/tasks-repository'
import type { UserSummaryRecord } from '../../users/repositories/users-repository'

export type ModerationOverviewRecord = {
  counts: {
    activeBoards: number
    archivedBoards: number
    activeTasks: number
    archivedTasks: number
    users: number
    admins: number
  }
  archivedBoards: BoardRecord[]
  archivedTasks: TaskRecord[]
  users: UserSummaryRecord[]
}

type BoardWithRelations = {
  id: string
  name: string
  slug: string
  inviteCode: string
  description: string | null
  ownerId: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  members: Array<{
    boardId: string
    userId: string
    color: string
    createdAt: Date
    updatedAt: Date
    user: {
      id: string
      email: string
      displayName: string
      role: 'USER' | 'ADMIN'
      emailVerificationStatus: 'PENDING' | 'VERIFIED'
      emailVerifiedAt: Date | null
      createdAt: Date
      updatedAt: Date
    }
  }>
  columns: Array<{
    id: string
    boardId: string
    name: string
    slug: string
    color: string
    position: number
    createdAt: Date
    updatedAt: Date
  }>
}

type TaskWithRelations = {
  id: string
  boardId: string
  columnId: string
  title: string
  description: string | null
  dueDate: Date | null
  assigneeId: string | null
  createdById: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  board: {
    ownerId: string | null
    archivedAt: Date | null
    members: Array<{ userId: string }>
  }
}

export type AdminRepository = {
  getOverview(): Promise<ModerationOverviewRecord>
  setBoardArchived(boardId: string, archived: boolean, actorId: string): Promise<BoardRecord>
  deleteBoard(boardId: string): Promise<void>
  setTaskArchived(taskId: string, archived: boolean, actorId: string): Promise<TaskRecord>
  deleteTask(taskId: string): Promise<void>
  setTaskAssignment(taskId: string, assigneeId: string | null): Promise<TaskRecord>
  setTaskColumn(taskId: string, columnId: string): Promise<TaskRecord>
}

function mapRole(role: 'USER' | 'ADMIN'): 'user' | 'admin' {
  return role === 'ADMIN' ? 'admin' : 'user'
}

function mapBoard(board: BoardWithRelations): BoardRecord {
  return {
    id: board.id,
    name: board.name,
    slug: board.slug,
    inviteCode: board.inviteCode,
    description: board.description,
    ownerId: board.ownerId,
    archivedAt: board.archivedAt,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    members: board.members.map((member) => ({
      boardId: member.boardId,
      userId: member.userId,
      color: member.color,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      user: {
        id: member.user.id,
        email: member.user.email,
        displayName: member.user.displayName,
        role: mapRole(member.user.role),
        emailVerificationStatus: member.user.emailVerificationStatus === 'PENDING' ? 'pending' : 'verified',
        emailVerifiedAt: member.user.emailVerifiedAt,
        createdAt: member.user.createdAt,
        updatedAt: member.user.updatedAt
      }
    })),
    columns: board.columns
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((column) => ({
        id: column.id,
        boardId: column.boardId,
        name: column.name,
        slug: column.slug,
        color: column.color,
        position: column.position,
        createdAt: column.createdAt,
        updatedAt: column.updatedAt
      }))
  }
}

function mapTask(task: TaskWithRelations): TaskRecord {
  return {
    id: task.id,
    boardId: task.boardId,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
    assigneeId: task.assigneeId,
    createdById: task.createdById,
    archivedAt: task.archivedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    boardOwnerId: task.board.ownerId,
    boardArchivedAt: task.board.archivedAt,
    boardMemberUserIds: task.board.members.map((member) => member.userId)
  }
}

function mapUser(user: {
  id: string
  email: string
  displayName: string
  role: 'USER' | 'ADMIN'
  emailVerificationStatus: 'PENDING' | 'VERIFIED'
  emailVerifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): UserSummaryRecord {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: mapRole(user.role),
    emailVerificationStatus: user.emailVerificationStatus === 'PENDING' ? 'pending' : 'verified',
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  }
}

function boardInclude() {
  return {
    members: {
      include: {
        user: true
      }
    },
    columns: {
      orderBy: {
        position: 'asc' as const
      }
    }
  }
}

function taskInclude() {
  return {
    board: {
      select: {
        ownerId: true,
        archivedAt: true,
        members: {
          select: {
            userId: true
          }
        }
      }
    }
  }
}

export class PrismaAdminRepository implements AdminRepository {
  async getOverview() {
    const [activeBoards, archivedBoardsCount, activeTasks, archivedTasksCount, usersCount, adminsCount] =
      await Promise.all([
        prisma.board.count({
          where: {
            archivedAt: null
          }
        }),
        prisma.board.count({
          where: {
            archivedAt: {
              not: null
            }
          }
        }),
        prisma.task.count({
          where: {
            archivedAt: null
          }
        }),
        prisma.task.count({
          where: {
            archivedAt: {
              not: null
            }
          }
        }),
        prisma.user.count(),
        prisma.user.count({
          where: {
            role: 'ADMIN'
          }
        })
      ])

    const [archivedBoards, archivedTasks, users] = await Promise.all([
      prisma.board.findMany({
        where: {
          archivedAt: {
            not: null
          }
        },
        include: boardInclude(),
        orderBy: {
          updatedAt: 'desc'
        }
      }),
      prisma.task.findMany({
        where: {
          archivedAt: {
            not: null
          }
        },
        include: taskInclude(),
        orderBy: {
          updatedAt: 'desc'
        }
      }),
      prisma.user.findMany({
        orderBy: {
          displayName: 'asc'
        }
      })
    ])

    return {
      counts: {
        activeBoards,
        archivedBoards: archivedBoardsCount,
        activeTasks,
        archivedTasks: archivedTasksCount,
        users: usersCount,
        admins: adminsCount
      },
      archivedBoards: archivedBoards.map((board) => mapBoard(board as BoardWithRelations)),
      archivedTasks: archivedTasks.map((task) => mapTask(task as TaskWithRelations)),
      users: users.map(mapUser)
    }
  }

  async setBoardArchived(boardId: string, archived: boolean, actorId: string) {
    const board = await prisma.board.update({
      where: {
        id: boardId
      },
      data: {
        archivedAt: archived ? new Date() : null,
        archivedById: archived ? actorId : null
      },
      include: boardInclude()
    })

    return mapBoard(board as BoardWithRelations)
  }

  async deleteBoard(boardId: string) {
    await prisma.$transaction(async (tx) => {
      const taskIds = (
        await tx.task.findMany({
          where: {
            boardId
          },
          select: {
            id: true
          }
        })
      ).map((task) => task.id)

      if (taskIds.length > 0) {
        await tx.attachment.deleteMany({
          where: {
            taskId: {
              in: taskIds
            }
          }
        })
      }

      await tx.board.delete({
        where: {
          id: boardId
        }
      })
    })
  }

  async setTaskArchived(taskId: string, archived: boolean, actorId: string) {
    const task = await prisma.task.update({
      where: {
        id: taskId
      },
      data: {
        archivedAt: archived ? new Date() : null,
        archivedById: archived ? actorId : null
      },
      include: taskInclude()
    })

    return mapTask(task as TaskWithRelations)
  }

  async deleteTask(taskId: string) {
    await prisma.$transaction(async (tx) => {
      await tx.attachment.deleteMany({
        where: {
          taskId
        }
      })

      await tx.task.delete({
        where: {
          id: taskId
        }
      })
    })
  }

  async setTaskAssignment(taskId: string, assigneeId: string | null) {
    const task = await prisma.task.update({
      where: {
        id: taskId
      },
      data: {
        assigneeId
      },
      include: taskInclude()
    })

    return mapTask(task as TaskWithRelations)
  }

  async setTaskColumn(taskId: string, columnId: string) {
    const task = await prisma.task.update({
      where: {
        id: taskId
      },
      data: {
        columnId
      },
      include: taskInclude()
    })

    return mapTask(task as TaskWithRelations)
  }
}
