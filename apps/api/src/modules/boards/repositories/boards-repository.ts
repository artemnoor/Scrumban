import { prisma } from '@scrumbun/db'

export type BoardMemberRecord = {
  boardId: string
  userId: string
  color: string
  createdAt: Date
  updatedAt: Date
  user: {
    id: string
    email: string
    displayName: string
    role: 'user' | 'admin'
    emailVerificationStatus: 'pending' | 'verified'
    emailVerifiedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }
}

export type BoardColumnRecord = {
  id: string
  boardId: string
  name: string
  slug: string
  color: string
  position: number
  createdAt: Date
  updatedAt: Date
}

export type BoardRecord = {
  id: string
  name: string
  slug: string
  inviteCode: string
  description: string | null
  ownerId: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  members: BoardMemberRecord[]
  columns: BoardColumnRecord[]
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

export type BoardsRepository = {
  listBoards(input: { actorId: string; includeArchived: boolean; includeAll: boolean }): Promise<BoardRecord[]>
  findBoardById(boardId: string): Promise<BoardRecord | null>
  findBoardByInviteCode(inviteCode: string): Promise<BoardRecord | null>
  createBoard(input: {
    name: string
    slug: string
    inviteCode: string
    description?: string | null
    ownerId: string
    ownerColor: string
    defaultColumns: Array<{ name: string; slug: string; color: string }>
  }): Promise<BoardRecord>
  updateBoard(
    boardId: string,
    input: {
      name?: string
      slug?: string
      description?: string | null
    }
  ): Promise<BoardRecord>
  setBoardArchived(
    boardId: string,
    input: {
      archived: boolean
      actorId: string
    }
  ): Promise<BoardRecord>
  addBoardMember(boardId: string, userId: string, color: string): Promise<BoardRecord>
  removeBoardMember(boardId: string, userId: string): Promise<BoardRecord>
  updateBoardMemberColor(boardId: string, userId: string, color: string): Promise<BoardRecord>
  updateBoardInviteCode(boardId: string, inviteCode: string): Promise<BoardRecord>
  createBoardColumn(
    boardId: string,
    input: {
      name: string
      slug: string
      color: string
    }
  ): Promise<BoardRecord>
  updateBoardColumn(
    boardId: string,
    columnId: string,
    input: {
      name?: string
      slug?: string
      color?: string
    }
  ): Promise<BoardRecord>
  reorderBoardColumns(boardId: string, columnIds: string[]): Promise<BoardRecord>
  deleteBoardColumn(
    boardId: string,
    columnId: string,
    destinationColumnId?: string
  ): Promise<BoardRecord>
  deleteBoard(boardId: string): Promise<void>
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

async function normalizeBoardColumnOrder(
  tx: Parameters<typeof prisma.$transaction>[0] extends (arg: infer T) => Promise<unknown> ? T : typeof prisma,
  boardId: string,
  columnIds: string[]
) {
  await tx.boardColumn.updateMany({
    where: {
      boardId
    },
    data: {
      position: {
        increment: 1000
      }
    }
  })

  for (const [position, columnId] of columnIds.entries()) {
    await tx.boardColumn.update({
      where: {
        id: columnId
      },
      data: {
        position
      }
    })
  }
}

export class PrismaBoardsRepository implements BoardsRepository {
  async listBoards(input: { actorId: string; includeArchived: boolean; includeAll: boolean }) {
    const boards = await prisma.board.findMany({
      where: {
        archivedAt: input.includeArchived ? undefined : null,
        ...(input.includeAll
          ? {}
          : {
              OR: [{ ownerId: input.actorId }, { members: { some: { userId: input.actorId } } }]
            })
      },
      include: boardInclude(),
      orderBy: {
        updatedAt: 'desc'
      }
    })

    return boards.map((board) => mapBoard(board as BoardWithRelations))
  }

  async findBoardById(boardId: string) {
    const board = await prisma.board.findUnique({
      where: {
        id: boardId
      },
      include: boardInclude()
    })

    return board ? mapBoard(board as BoardWithRelations) : null
  }

  async findBoardByInviteCode(inviteCode: string) {
    const board = await prisma.board.findUnique({
      where: {
        inviteCode
      },
      include: boardInclude()
    })

    return board ? mapBoard(board as BoardWithRelations) : null
  }

  async createBoard(input: {
    name: string
    slug: string
    inviteCode: string
    description?: string | null
    ownerId: string
    ownerColor: string
    defaultColumns: Array<{ name: string; slug: string; color: string }>
  }) {
    const board = await prisma.board.create({
      data: {
        name: input.name,
        slug: input.slug,
        inviteCode: input.inviteCode,
        description: input.description ?? null,
        ownerId: input.ownerId,
        members: {
          create: {
            userId: input.ownerId,
            color: input.ownerColor
          }
        },
        columns: {
          create: input.defaultColumns.map((column, position) => ({
            name: column.name,
            slug: column.slug,
            color: column.color,
            position
          }))
        }
      },
      include: boardInclude()
    })

    return mapBoard(board as BoardWithRelations)
  }

  async updateBoard(
    boardId: string,
    input: {
      name?: string
      slug?: string
      description?: string | null
    }
  ) {
    const board = await prisma.board.update({
      where: {
        id: boardId
      },
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description
      },
      include: boardInclude()
    })

    return mapBoard(board as BoardWithRelations)
  }

  async setBoardArchived(
    boardId: string,
    input: {
      archived: boolean
      actorId: string
    }
  ) {
    const board = await prisma.board.update({
      where: {
        id: boardId
      },
      data: {
        archivedAt: input.archived ? new Date() : null,
        archivedById: input.archived ? input.actorId : null
      },
      include: boardInclude()
    })

    return mapBoard(board as BoardWithRelations)
  }

  async addBoardMember(boardId: string, userId: string, color: string) {
    const board = await prisma.board.update({
      where: {
        id: boardId
      },
      data: {
        members: {
          upsert: {
            where: {
              boardId_userId: {
                boardId,
                userId
              }
            },
            update: {
              color
            },
            create: {
              userId,
              color
            }
          }
        }
      },
      include: boardInclude()
    })

    return mapBoard(board as BoardWithRelations)
  }

  async removeBoardMember(boardId: string, userId: string) {
    const board = await prisma.board.update({
      where: {
        id: boardId
      },
      data: {
        members: {
          delete: {
            boardId_userId: {
              boardId,
              userId
            }
          }
        }
      },
      include: boardInclude()
    })

    return mapBoard(board as BoardWithRelations)
  }

  async updateBoardMemberColor(boardId: string, userId: string, color: string) {
    const board = await prisma.board.update({
      where: {
        id: boardId
      },
      data: {
        members: {
          update: {
            where: {
              boardId_userId: {
                boardId,
                userId
              }
            },
            data: {
              color
            }
          }
        }
      },
      include: boardInclude()
    })

    return mapBoard(board as BoardWithRelations)
  }

  async updateBoardInviteCode(boardId: string, inviteCode: string) {
    const board = await prisma.board.update({
      where: {
        id: boardId
      },
      data: {
        inviteCode
      },
      include: boardInclude()
    })

    return mapBoard(board as BoardWithRelations)
  }

  async createBoardColumn(
    boardId: string,
    input: {
      name: string
      slug: string
      color: string
    }
  ) {
    const board = await prisma.$transaction(async (tx) => {
      const columnCount = await tx.boardColumn.count({
        where: {
          boardId
        }
      })

      await tx.boardColumn.create({
        data: {
          boardId,
          name: input.name,
          slug: input.slug,
          color: input.color,
          position: columnCount
        }
      })

      return tx.board.findUniqueOrThrow({
        where: {
          id: boardId
        },
        include: boardInclude()
      })
    })

    return mapBoard(board as BoardWithRelations)
  }

  async updateBoardColumn(
    boardId: string,
    columnId: string,
    input: {
      name?: string
      slug?: string
      color?: string
    }
  ) {
    const board = await prisma.$transaction(async (tx) => {
      await tx.boardColumn.update({
        where: {
          id: columnId
        },
        data: {
          name: input.name,
          slug: input.slug,
          color: input.color
        }
      })

      return tx.board.findUniqueOrThrow({
        where: {
          id: boardId
        },
        include: boardInclude()
      })
    })

    return mapBoard(board as BoardWithRelations)
  }

  async reorderBoardColumns(boardId: string, columnIds: string[]) {
    const board = await prisma.$transaction(async (tx) => {
      await normalizeBoardColumnOrder(tx, boardId, columnIds)

      return tx.board.findUniqueOrThrow({
        where: {
          id: boardId
        },
        include: boardInclude()
      })
    })

    return mapBoard(board as BoardWithRelations)
  }

  async deleteBoardColumn(boardId: string, columnId: string, destinationColumnId?: string) {
    const board = await prisma.$transaction(async (tx) => {
      const taskCount = await tx.task.count({
        where: {
          boardId,
          columnId
        }
      })

      if (taskCount > 0 && !destinationColumnId) {
        throw new Error('COLUMN_HAS_TASKS')
      }

      if (destinationColumnId) {
        await tx.task.updateMany({
          where: {
            boardId,
            columnId
          },
          data: {
            columnId: destinationColumnId
          }
        })
      }

      await tx.boardColumn.delete({
        where: {
          id: columnId
        }
      })

      const remainingColumns = await tx.boardColumn.findMany({
        where: {
          boardId
        },
        orderBy: {
          position: 'asc'
        }
      })

      await normalizeBoardColumnOrder(
        tx,
        boardId,
        remainingColumns.map((column) => column.id)
      )

      return tx.board.findUniqueOrThrow({
        where: {
          id: boardId
        },
        include: boardInclude()
      })
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
}
