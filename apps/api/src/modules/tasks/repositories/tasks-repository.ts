import { prisma } from '@scrumbun/db'

export type TaskRecord = {
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
  boardOwnerId: string | null
  boardArchivedAt: Date | null
  boardMemberUserIds: string[]
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

export type TasksRepository = {
  listTasksByBoard(boardId: string, includeArchived: boolean): Promise<TaskRecord[]>
  findTaskById(taskId: string): Promise<TaskRecord | null>
  createTask(input: {
    boardId: string
    columnId: string
    title: string
    description?: string | null
    dueDate?: Date | null
    assigneeId?: string | null
    createdById: string
  }): Promise<TaskRecord>
  updateTask(
    taskId: string,
    input: {
      title?: string
      description?: string | null
      dueDate?: Date | null
      assigneeId?: string | null
    }
  ): Promise<TaskRecord>
  setTaskColumn(taskId: string, columnId: string): Promise<TaskRecord>
  setTaskAssignment(taskId: string, assigneeId: string | null): Promise<TaskRecord>
  setTaskArchived(
    taskId: string,
    input: {
      archived: boolean
      actorId: string
    }
  ): Promise<TaskRecord>
  deleteTask(taskId: string): Promise<void>
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

export class PrismaTasksRepository implements TasksRepository {
  async listTasksByBoard(boardId: string, includeArchived: boolean) {
    const tasks = await prisma.task.findMany({
      where: {
        boardId,
        archivedAt: includeArchived ? undefined : null
      },
      include: taskInclude(),
      orderBy: [{ column: { position: 'asc' } }, { updatedAt: 'desc' }]
    })

    return tasks.map((task) => mapTask(task as TaskWithRelations))
  }

  async findTaskById(taskId: string) {
    const task = await prisma.task.findUnique({
      where: {
        id: taskId
      },
      include: taskInclude()
    })

    return task ? mapTask(task as TaskWithRelations) : null
  }

  async createTask(input: {
    boardId: string
    columnId: string
    title: string
    description?: string | null
    dueDate?: Date | null
    assigneeId?: string | null
    createdById: string
  }) {
    const task = await prisma.task.create({
      data: {
        boardId: input.boardId,
        columnId: input.columnId,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        assigneeId: input.assigneeId ?? null,
        createdById: input.createdById
      },
      include: taskInclude()
    })

    return mapTask(task as TaskWithRelations)
  }

  async updateTask(
    taskId: string,
    input: {
      title?: string
      description?: string | null
      dueDate?: Date | null
      assigneeId?: string | null
    }
  ) {
    const task = await prisma.task.update({
      where: {
        id: taskId
      },
      data: {
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        assigneeId: input.assigneeId
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

  async setTaskArchived(
    taskId: string,
    input: {
      archived: boolean
      actorId: string
    }
  ) {
    const task = await prisma.task.update({
      where: {
        id: taskId
      },
      data: {
        archivedAt: input.archived ? new Date() : null,
        archivedById: input.archived ? input.actorId : null
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
}
