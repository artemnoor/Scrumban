import { createLogger, loadNodeEnv } from '@scrumbun/config'
import { defaultBoardColumns } from '@scrumbun/shared/tasks'
import { PrismaClient } from '../generated/prisma/index.js'

loadNodeEnv()

const logger = createLogger('packages/db/seed')
const prisma = new PrismaClient()

async function ensureBoardColumns(boardId: string) {
  logger.debug('Ensuring default board columns exist', {
    boardId,
    count: defaultBoardColumns.length
  })

  for (const [position, column] of defaultBoardColumns.entries()) {
    await prisma.boardColumn.upsert({
      where: {
        boardId_slug: {
          boardId,
          slug: column.slug
        }
      },
      update: {
        name: column.name,
        position
      },
      create: {
        boardId,
        name: column.name,
        slug: column.slug,
        position
      }
    })
  }

  return prisma.boardColumn.findMany({
    where: {
      boardId
    },
    orderBy: {
      position: 'asc'
    }
  })
}

async function ensureBoardMembership(boardId: string, userId: string) {
  await prisma.boardMember.upsert({
    where: {
      boardId_userId: {
        boardId,
        userId
      }
    },
    update: {},
    create: {
      boardId,
      userId
    }
  })
}

async function main() {
  logger.info('Starting seed flow', {
    nodeEnv: process.env.NODE_ENV ?? 'development'
  })

  const adminUser = await prisma.user.upsert({
    where: {
      email: 'admin@scrumbun.dev'
    },
    update: {
      displayName: 'System Admin',
      role: 'ADMIN',
      emailVerificationStatus: 'VERIFIED',
      emailVerifiedAt: new Date()
    },
    create: {
      email: 'admin@scrumbun.dev',
      displayName: 'System Admin',
      passwordHash: 'seed-admin-password-hash',
      role: 'ADMIN',
      emailVerificationStatus: 'VERIFIED',
      emailVerifiedAt: new Date()
    }
  })

  const productOwner = await prisma.user.upsert({
    where: {
      email: 'owner@scrumbun.dev'
    },
    update: {
      displayName: 'Product Owner',
      emailVerificationStatus: 'VERIFIED',
      emailVerifiedAt: new Date()
    },
    create: {
      email: 'owner@scrumbun.dev',
      displayName: 'Product Owner',
      passwordHash: 'seed-owner-password-hash',
      role: 'USER',
      emailVerificationStatus: 'VERIFIED',
      emailVerifiedAt: new Date()
    }
  })

  const collaborator = await prisma.user.upsert({
    where: {
      email: 'member@scrumbun.dev'
    },
    update: {
      displayName: 'Board Member',
      emailVerificationStatus: 'VERIFIED',
      emailVerifiedAt: new Date()
    },
    create: {
      email: 'member@scrumbun.dev',
      displayName: 'Board Member',
      passwordHash: 'seed-member-password-hash',
      role: 'USER',
      emailVerificationStatus: 'VERIFIED',
      emailVerifiedAt: new Date()
    }
  })

  const board = await prisma.board.upsert({
    where: {
      slug: 'platform-ops'
    },
    update: {
      name: 'Platform Ops',
      description: 'Seed board for manual verification of board membership, columns, and task workflows.',
      ownerId: productOwner.id,
      archivedAt: null,
      archivedById: null
    },
    create: {
      name: 'Platform Ops',
      slug: 'platform-ops',
      description: 'Seed board for manual verification of board membership, columns, and task workflows.',
      ownerId: productOwner.id
    }
  })

  await ensureBoardMembership(board.id, productOwner.id)
  await ensureBoardMembership(board.id, collaborator.id)

  const columns = await ensureBoardColumns(board.id)
  const backlogColumn = columns.find((column) => column.slug === 'backlog')
  const inProgressColumn = columns.find((column) => column.slug === 'in-progress')
  const reviewColumn = columns.find((column) => column.slug === 'review')

  if (!backlogColumn || !inProgressColumn || !reviewColumn) {
    throw new Error('Seed columns were not created correctly')
  }

  await prisma.task.upsert({
    where: {
      id: 'seed-task-platform-kickoff'
    },
    update: {
      title: 'Kick off board workflow',
      description: 'Verify create, update, assignment, participant, and column transitions.',
      columnId: inProgressColumn.id,
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3),
      assigneeId: collaborator.id,
      createdById: adminUser.id,
      archivedAt: null,
      archivedById: null
    },
    create: {
      id: 'seed-task-platform-kickoff',
      boardId: board.id,
      columnId: inProgressColumn.id,
      title: 'Kick off board workflow',
      description: 'Verify create, update, assignment, participant, and column transitions.',
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3),
      assigneeId: collaborator.id,
      createdById: adminUser.id
    }
  })

  await prisma.task.upsert({
    where: {
      id: 'seed-task-archived-review'
    },
    update: {
      title: 'Review archived task recovery',
      description: 'Used by admin moderation screens to test restore and delete flows.',
      columnId: reviewColumn.id,
      dueDate: null,
      assigneeId: null,
      createdById: productOwner.id,
      archivedAt: new Date(),
      archivedById: adminUser.id
    },
    create: {
      id: 'seed-task-archived-review',
      boardId: board.id,
      columnId: reviewColumn.id,
      title: 'Review archived task recovery',
      description: 'Used by admin moderation screens to test restore and delete flows.',
      createdById: productOwner.id,
      archivedAt: new Date(),
      archivedById: adminUser.id
    }
  })

  await prisma.task.upsert({
    where: {
      id: 'seed-task-backlog-members'
    },
    update: {
      title: 'Invite members to the board',
      description: 'Used to verify member management and board-scoped permissions.',
      columnId: backlogColumn.id,
      dueDate: null,
      assigneeId: productOwner.id,
      createdById: collaborator.id,
      archivedAt: null,
      archivedById: null
    },
    create: {
      id: 'seed-task-backlog-members',
      boardId: board.id,
      columnId: backlogColumn.id,
      title: 'Invite members to the board',
      description: 'Used to verify member management and board-scoped permissions.',
      assigneeId: productOwner.id,
      createdById: collaborator.id
    }
  })

  logger.info('Seed flow finished', {
    boardId: board.id,
    adminUserId: adminUser.id,
    productOwnerId: productOwner.id,
    collaboratorUserId: collaborator.id,
    columnCount: columns.length
  })
}

main()
  .catch((error) => {
    logger.error('Seed flow failed', {
      message: error instanceof Error ? error.message : 'Unknown error'
    })
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
