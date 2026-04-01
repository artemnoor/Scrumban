import { Link, useSearchParams } from 'react-router-dom'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent
} from 'react'
import type { UserDto } from '@scrumbun/shared/auth'
import { boardColorPalette, type BoardColumnDto, type BoardDto, type TaskDto } from '@scrumbun/shared/tasks'
import { useAuth } from '../auth/auth-context'
import { createBrowserLogger } from '../../shared/logger'
import { AppHeader } from '../../shared/ui/app-header'
import {
  createBoardColumn,
  deleteBoard,
  deleteBoardColumn,
  listBoards,
  regenerateBoardInviteCode,
  removeBoardMember,
  reorderBoardColumns,
  setBoardArchived,
  updateBoard,
  updateBoardColumn,
  updateBoardMemberColor
} from '../boards/api'
import {
  createTask,
  deleteTask,
  listTasks,
  setTaskArchived,
  updateTask,
  updateTaskAssignment,
  updateTaskColumn
} from '../tasks/api'
import { listUsers } from '../users/api'

const logger = createBrowserLogger('apps/web/dashboard-page')

type BoardModalState = { mode: 'settings' } | { mode: 'members' }
type TaskModalState = { mode: 'create' } | { mode: 'edit'; taskId: string }
type ColumnDrafts = Record<
  string,
  { name: string; slug: string; color: string; destinationColumnId: string }
>

function slugify(input: string) {
  return input.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
}

function formatDateTimeInput(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : ''
}

function formatDeadlineLabel(value: string | null) {
  if (!value) return 'Без срока'
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(value))
}

function formatRoleLabel(role: 'user' | 'admin') {
  return role === 'admin' ? 'Админ' : 'Участник'
}

function isInteractiveBoardTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(target.closest('.card, button, input, textarea, select, option, label, a'))
    : false
}

function hexToRgb(color: string) {
  const normalized = color.replace('#', '')
  const value = Number.parseInt(normalized, 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return `${red}, ${green}, ${blue}`
}

function buildAccentVars(color: string): CSSProperties {
  return {
    '--board-accent': color,
    '--board-accent-rgb': hexToRgb(color)
  } as CSSProperties
}

function pickNextAccentColor(usedColors: string[]) {
  return boardColorPalette.find((color) => !usedColors.includes(color)) ?? boardColorPalette[usedColors.length % boardColorPalette.length]
}

function buildColumnDrafts(columns: BoardColumnDto[]): ColumnDrafts {
  return Object.fromEntries(
    columns.map((column) => {
      const destinationColumnId =
        columns.find((item) => item.id !== column.id && item.position > column.position)?.id ??
        columns.find((item) => item.id !== column.id)?.id ??
        ''

      return [
        column.id,
        {
          name: column.name,
          slug: column.slug,
          color: column.color,
          destinationColumnId
        }
      ]
    })
  )
}

function ColorField({
  color,
  id,
  label,
  onChange
}: {
  color: string
  id: string
  label: string
  onChange(nextColor: string): void
}) {
  return (
    <label className="color-field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <div className="color-field-control">
        <input
          className="color-swatch-input"
          id={id}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          type="color"
          value={color}
        />
        <span className="color-chip">{color}</span>
      </div>
    </label>
  )
}

function TaskBoardCard({
  columns,
  draggedTaskId,
  memberColors,
  task,
  users,
  onArchiveToggle,
  onDelete,
  onDragEnd,
  onDragStart,
  onMove,
  onOpen
}: {
  columns: BoardColumnDto[]
  draggedTaskId: string | null
  memberColors: Record<string, string>
  task: TaskDto
  users: UserDto[]
  onArchiveToggle(task: TaskDto): Promise<void>
  onDelete(task: TaskDto): Promise<void>
  onDragEnd(): void
  onDragStart(task: TaskDto): void
  onMove(task: TaskDto, columnId: string): Promise<void>
  onOpen(task: TaskDto): void
}) {
  const index = columns.findIndex((column) => column.id === task.columnId)
  const previous = index > 0 ? columns[index - 1] : null
  const next = index >= 0 && index < columns.length - 1 ? columns[index + 1] : null
  const column = columns.find((item) => item.id === task.columnId)
  const owner = users.find((user) => user.id === task.assigneeId) ?? users.find((user) => user.id === task.createdById)
  const ownerColor = memberColors[task.assigneeId ?? task.createdById ?? ''] ?? '#6B7280'

  return (
    <article
      className={`card task-board-card ${task.archivedAt ? 'is-archived-card' : ''} ${
        draggedTaskId === task.id ? 'is-dragging' : ''
      }`}
      draggable={!task.archivedAt}
      onClick={() => onOpen(task)}
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        if (task.archivedAt) {
          event.preventDefault()
          return
        }
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', task.id)
        onDragStart(task)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(task)
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="card-head">
        <div className="card-copy task-card-text-lock">
          <div className="card-kicker">
            <div className="card-badge" style={buildAccentVars(column?.color ?? '#6B7280')}>
              {column?.name ?? 'Колонка'}
            </div>
            {task.archivedAt ? <div className="card-badge">В архиве</div> : null}
          </div>
          <div className="card-title">{task.title}</div>
          <div className="card-subtitle">{task.description ?? 'Описания пока нет.'}</div>
        </div>
        <div className="card-actions">
          <button
            aria-label="Редактировать задачу"
            className="card-delete-btn card-icon-btn"
            onClick={(event) => {
              event.stopPropagation()
              onOpen(task)
            }}
            type="button"
          >
            ✎
          </button>
          <button
            className="card-delete-btn"
            onClick={(event) => {
              event.stopPropagation()
              onArchiveToggle(task).catch(() => undefined)
            }}
            type="button"
          >
            {task.archivedAt ? '↺' : '×'}
          </button>
        </div>
      </div>
      <div className="card-meta task-card-text-lock">
        <div className="card-owner-badge" style={buildAccentVars(ownerColor)}>
          {owner?.displayName ?? 'Без исполнителя'}
        </div>
        <div className="card-deadline">{formatDeadlineLabel(task.dueDate)}</div>
      </div>
      <div className="card-footer">
        <div className="card-move-controls">
          {task.archivedAt ? (
            <>
              <button
                className="card-move-btn"
                onClick={(event) => {
                  event.stopPropagation()
                  onArchiveToggle(task).catch(() => undefined)
                }}
                type="button"
              >
                Вернуть
              </button>
              <button
                className="card-move-btn is-danger-lite"
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(task).catch(() => undefined)
                }}
                type="button"
              >
                Удалить
              </button>
            </>
          ) : (
            <>
              <button
                className="card-move-btn"
                disabled={!previous}
                onClick={(event) => {
                  event.stopPropagation()
                  if (previous) onMove(task, previous.id).catch(() => undefined)
                }}
                type="button"
              >
                {previous ? `← ${previous.name}` : '← Старт'}
              </button>
              <button
                className="card-move-btn"
                disabled={!next}
                onClick={(event) => {
                  event.stopPropagation()
                  if (next) onMove(task, next.id).catch(() => undefined)
                }}
                type="button"
              >
                {next ? `${next.name} →` : 'Финиш →'}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

export function DashboardPage() {
  const auth = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const boardRef = useRef<HTMLDivElement | null>(null)
  const boardPanRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const [boards, setBoards] = useState<BoardDto[]>([])
  const [tasks, setTasks] = useState<TaskDto[]>([])
  const [users, setUsers] = useState<UserDto[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isBoardPanning, setIsBoardPanning] = useState(false)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dropColumnId, setDropColumnId] = useState<string | null>(null)
  const [boardModal, setBoardModal] = useState<BoardModalState | null>(null)
  const [taskModal, setTaskModal] = useState<TaskModalState | null>(null)
  const [isBoardSubmitting, setIsBoardSubmitting] = useState(false)
  const [isTaskSubmitting, setIsTaskSubmitting] = useState(false)
  const [isInviteCodeSubmitting, setIsInviteCodeSubmitting] = useState(false)
  const [isColumnSubmitting, setIsColumnSubmitting] = useState(false)
  const [memberColorTargetId, setMemberColorTargetId] = useState<string | null>(null)
  const [boardForm, setBoardForm] = useState({ name: '', slug: '', description: '' })
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    assigneeId: '',
    columnId: ''
  })
  const [newColumnForm, setNewColumnForm] = useState<{ name: string; slug: string; color: string }>({
    name: '',
    slug: '',
    color: boardColorPalette[0]
  })
  const [columnDrafts, setColumnDrafts] = useState<ColumnDrafts>({})
  const [memberColorDrafts, setMemberColorDrafts] = useState<Record<string, string>>({})

  const selectedBoard = boards.find((board) => board.id === selectedBoardId) ?? null
  const selectedTask =
    taskModal?.mode === 'edit' ? tasks.find((task) => task.id === taskModal.taskId) ?? null : null
  const boardColumns = selectedBoard?.columns ?? []
  const canManageSelectedBoard = Boolean(
    selectedBoard &&
      (auth.session?.user.role === 'admin' || selectedBoard.ownerId === auth.session?.user.id)
  )

  const memberColors = useMemo(
    () =>
      Object.fromEntries((selectedBoard?.members ?? []).map((member) => [member.userId, member.color])),
    [selectedBoard]
  )

  const boardParticipants = useMemo(
    () => (selectedBoard?.members ?? []).map((member) => member.user),
    [selectedBoard]
  )
  const nextColumnColor = useMemo(
    () => pickNextAccentColor(boardColumns.map((column) => column.color)),
    [boardColumns]
  )

  useEffect(
    () => () => {
      window.removeEventListener('mousemove', handleBoardPan)
      window.removeEventListener('mouseup', stopBoardPan)
      window.removeEventListener('blur', stopBoardPan)
    },
    []
  )

  useEffect(() => {
    if (selectedBoard && boardModal?.mode === 'settings') {
      setColumnDrafts(buildColumnDrafts(selectedBoard.columns))
      setNewColumnForm({ name: '', slug: '', color: nextColumnColor })
    }

    if (selectedBoard && boardModal?.mode === 'members') {
      setMemberColorDrafts(
        Object.fromEntries(selectedBoard.members.map((member) => [member.userId, member.color]))
      )
    }
  }, [boardModal?.mode, nextColumnColor, selectedBoard])

  async function refreshBoards(preferredBoardId?: string) {
    const nextBoards = await listBoards(true)
    setBoards(nextBoards)

    const requestedBoardId = preferredBoardId ?? searchParams.get('board') ?? undefined
    const nextSelectedBoard =
      nextBoards.find((board) => board.id === requestedBoardId) ??
      nextBoards.find((board) => !board.archivedAt) ??
      nextBoards[0] ??
      null

    setSelectedBoardId(nextSelectedBoard?.id ?? null)
    setSearchParams(nextSelectedBoard ? { board: nextSelectedBoard.id } : {}, { replace: true })
    return nextSelectedBoard
  }

  async function refreshTasks(boardId: string) {
    setTasks(await listTasks(boardId, true))
  }

  async function bootstrapWorkspace() {
    setIsBootstrapping(true)
    setErrorMessage(null)

    try {
      const [nextBoard, nextUsers] = await Promise.all([
        refreshBoards(searchParams.get('board') ?? undefined),
        listUsers()
      ])

      setUsers(nextUsers)

      if (nextBoard) {
        await refreshTasks(nextBoard.id)
      } else {
        setTasks([])
      }

      logger.info('Workspace bootstrap complete', {
        hasSelectedBoard: Boolean(nextBoard),
        users: nextUsers.length,
        columns: nextBoard?.columns.length ?? 0
      })
    } catch (error) {
      logger.error('Workspace bootstrap failed', {
        message: error instanceof Error ? error.message : 'Unknown workspace error'
      })
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить пространство')
    } finally {
      setIsBootstrapping(false)
    }
  }

  useEffect(() => {
    if (auth.session) {
      bootstrapWorkspace().catch(() => undefined)
    }
  }, [auth.session?.user.id])

  useEffect(() => {
    if (!selectedBoardId) {
      setTasks([])
      return
    }

    refreshTasks(selectedBoardId).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить задачи')
    })
  }, [selectedBoardId])

  function openBoardSettingsModal() {
    if (!selectedBoard || !canManageSelectedBoard) return

    setBoardForm({
      name: selectedBoard.name,
      slug: selectedBoard.slug,
      description: selectedBoard.description ?? ''
    })
    setColumnDrafts(buildColumnDrafts(selectedBoard.columns))
    setNewColumnForm({ name: '', slug: '', color: nextColumnColor })
    setBoardModal({ mode: 'settings' })
  }

  function openBoardMembersModal() {
    if (!selectedBoard || !canManageSelectedBoard) return

    setMemberColorDrafts(
      Object.fromEntries(selectedBoard.members.map((member) => [member.userId, member.color]))
    )
    setBoardModal({ mode: 'members' })
  }

  function closeBoardModal() {
    setBoardModal(null)
    setIsBoardSubmitting(false)
    setIsInviteCodeSubmitting(false)
    setIsColumnSubmitting(false)
    setMemberColorTargetId(null)
  }

  function openCreateTaskModal() {
    if (!selectedBoard || selectedBoard.archivedAt) return

    setTaskForm({
      title: '',
      description: '',
      dueDate: '',
      assigneeId: '',
      columnId: selectedBoard.columns[0]?.id ?? ''
    })
    setTaskModal({ mode: 'create' })
  }

  function openEditTaskModal(task: TaskDto) {
    setTaskForm({
      title: task.title,
      description: task.description ?? '',
      dueDate: formatDateTimeInput(task.dueDate),
      assigneeId: task.assigneeId ?? '',
      columnId: task.columnId
    })
    setTaskModal({ mode: 'edit', taskId: task.id })
  }

  function closeTaskModal() {
    setTaskModal(null)
    setIsTaskSubmitting(false)
  }

  async function handleBoardSubmit() {
    if (!boardForm.name.trim()) {
      return setErrorMessage('Укажите название доски')
    }

    setIsBoardSubmitting(true)
    setErrorMessage(null)

    try {
      if (selectedBoard && boardModal?.mode === 'settings') {
        await updateBoard(selectedBoard.id, {
          name: boardForm.name.trim(),
          slug: boardForm.slug.trim() || slugify(boardForm.name),
          description: boardForm.description.trim() || null
        })
        await refreshBoards(selectedBoard.id)
      }

      closeBoardModal()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось сохранить доску')
    } finally {
      setIsBoardSubmitting(false)
    }
  }

  async function handleBoardArchiveToggle() {
    if (!selectedBoard) return

    try {
      await setBoardArchived(selectedBoard.id, { archived: !selectedBoard.archivedAt })
      await refreshBoards(selectedBoard.id)
      closeBoardModal()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось изменить статус доски')
    }
  }

  async function handleBoardDelete() {
    if (!selectedBoard || !window.confirm(`Удалить доску "${selectedBoard.name}" навсегда?`)) return

    try {
      await deleteBoard(selectedBoard.id)
      const nextBoard = await refreshBoards()

      if (nextBoard) {
        await refreshTasks(nextBoard.id)
      } else {
        setTasks([])
      }

      closeBoardModal()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить доску')
    }
  }

  async function handleTaskSubmit() {
    if (!selectedBoard || !taskForm.title.trim()) {
      return setErrorMessage('Укажите название задачи')
    }

    if (!taskForm.columnId) {
      return setErrorMessage('Выберите колонку')
    }

    setIsTaskSubmitting(true)

    try {
      if (taskModal?.mode === 'create') {
        await createTask({
          boardId: selectedBoard.id,
          columnId: taskForm.columnId,
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || undefined,
          dueDate: taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : undefined,
          assigneeId: taskForm.assigneeId || undefined
        })
      } else if (selectedTask) {
        await updateTask(selectedTask.id, {
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || null,
          dueDate: taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : null
        })

        if ((selectedTask.assigneeId ?? '') !== taskForm.assigneeId) {
          await updateTaskAssignment(selectedTask.id, { assigneeId: taskForm.assigneeId || null })
        }

        if (selectedTask.columnId !== taskForm.columnId) {
          await updateTaskColumn(selectedTask.id, { columnId: taskForm.columnId })
        }
      }

      await refreshTasks(selectedBoard.id)
      closeTaskModal()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось сохранить задачу')
    } finally {
      setIsTaskSubmitting(false)
    }
  }

  async function handleTaskArchiveToggle(task: TaskDto) {
    if (!selectedBoard) return

    try {
      await setTaskArchived(task.id, { archived: !task.archivedAt })
      await refreshTasks(selectedBoard.id)

      if (taskModal?.mode === 'edit' && taskModal.taskId === task.id) {
        closeTaskModal()
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось изменить статус задачи')
    }
  }

  async function handleTaskDelete(task: TaskDto) {
    if (!selectedBoard || !window.confirm(`Удалить задачу "${task.title}" навсегда?`)) return

    try {
      await deleteTask(task.id)
      await refreshTasks(selectedBoard.id)

      if (taskModal?.mode === 'edit' && taskModal.taskId === task.id) {
        closeTaskModal()
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить задачу')
    }
  }

  async function handleTaskMove(task: TaskDto, columnId: string) {
    if (!selectedBoard || task.columnId === columnId) return

    const previousTasks = tasks
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              columnId
            }
          : item
      )
    )

    try {
      await updateTaskColumn(task.id, { columnId })
    } catch (error) {
      setTasks(previousTasks)
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось переместить задачу')
    }
  }

  async function handleRegenerateInviteCode() {
    if (!selectedBoard) return

    if (!window.confirm('Перегенерировать код приглашения для этой доски? Старый код перестанет работать.')) {
      return
    }

    setIsInviteCodeSubmitting(true)
    setErrorMessage(null)

    try {
      await regenerateBoardInviteCode(selectedBoard.id)
      await refreshBoards(selectedBoard.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось перегенерировать код приглашения')
    } finally {
      setIsInviteCodeSubmitting(false)
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedBoard || !window.confirm('Убрать участника из доски?')) return

    try {
      await removeBoardMember(selectedBoard.id, userId)
      await refreshBoards(selectedBoard.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить участника')
    }
  }

  async function handleSaveMemberColor(userId: string) {
    if (!selectedBoard) return

    const color = memberColorDrafts[userId]
    if (!color) return

    setMemberColorTargetId(userId)

    try {
      await updateBoardMemberColor(selectedBoard.id, userId, { color })
      await refreshBoards(selectedBoard.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить цвет участника')
    } finally {
      setMemberColorTargetId(null)
    }
  }

  async function handleCreateColumn() {
    if (!selectedBoard || !newColumnForm.name.trim()) {
      return setErrorMessage('Укажите название колонки')
    }

    setIsColumnSubmitting(true)

    try {
      await createBoardColumn(selectedBoard.id, {
        name: newColumnForm.name.trim(),
        slug: newColumnForm.slug.trim() || undefined,
        color: newColumnForm.color
      })
      await refreshBoards(selectedBoard.id)
      setNewColumnForm({ name: '', slug: '', color: nextColumnColor })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать колонку')
    } finally {
      setIsColumnSubmitting(false)
    }
  }

  async function handleSaveColumn(columnId: string) {
    if (!selectedBoard) return

    const draft = columnDrafts[columnId]
    if (!draft?.name.trim()) {
      return setErrorMessage('Укажите название колонки')
    }

    try {
      await updateBoardColumn(selectedBoard.id, columnId, {
        name: draft.name.trim(),
        slug: draft.slug.trim() || undefined,
        color: draft.color
      })
      await refreshBoards(selectedBoard.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить колонку')
    }
  }

  async function handleMoveColumn(columnId: string, direction: -1 | 1) {
    if (!selectedBoard) return

    const currentIndex = selectedBoard.columns.findIndex((column) => column.id === columnId)
    const nextIndex = currentIndex + direction

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= selectedBoard.columns.length) {
      return
    }

    const columnIds = selectedBoard.columns.map((column) => column.id)
    const [movedId] = columnIds.splice(currentIndex, 1)
    columnIds.splice(nextIndex, 0, movedId)

    try {
      await reorderBoardColumns(selectedBoard.id, columnIds)
      await refreshBoards(selectedBoard.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось изменить порядок колонок')
    }
  }

  async function handleDeleteColumn(column: BoardColumnDto) {
    if (!selectedBoard) return

    const taskCount = tasks.filter((task) => task.columnId === column.id).length
    const destinationColumnId = columnDrafts[column.id]?.destinationColumnId || undefined

    if (taskCount > 0 && !destinationColumnId) {
      return setErrorMessage('Выберите колонку для переноса задач')
    }

    if (
      !window.confirm(
        taskCount > 0
          ? `Удалить колонку "${column.name}" и перенести ${taskCount} задач(и)?`
          : `Удалить колонку "${column.name}"?`
      )
    ) {
      return
    }

    try {
      await deleteBoardColumn(selectedBoard.id, column.id, {
        destinationColumnId: taskCount > 0 ? destinationColumnId : undefined
      })
      await refreshBoards(selectedBoard.id)
      await refreshTasks(selectedBoard.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить колонку')
    }
  }

  function startBoardPan(event: ReactMouseEvent<HTMLDivElement>) {
    const boardElement = boardRef.current
    if (!boardElement || event.button !== 0 || isInteractiveBoardTarget(event.target)) return

    boardPanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: boardElement.scrollLeft,
      scrollTop: boardElement.scrollTop
    }

    setIsBoardPanning(true)
    window.addEventListener('mousemove', handleBoardPan)
    window.addEventListener('mouseup', stopBoardPan)
    window.addEventListener('blur', stopBoardPan)
  }

  function handleBoardPan(event: MouseEvent) {
    const boardElement = boardRef.current
    const panState = boardPanRef.current

    if (!boardElement || !panState) return

    const offsetX = event.clientX - panState.startX
    const offsetY = event.clientY - panState.startY
    boardElement.scrollLeft = panState.scrollLeft - offsetX
    boardElement.scrollTop = panState.scrollTop - offsetY

    if (offsetX !== 0 || offsetY !== 0) {
      event.preventDefault()
    }
  }

  function stopBoardPan() {
    boardPanRef.current = null
    setIsBoardPanning(false)
    window.removeEventListener('mousemove', handleBoardPan)
    window.removeEventListener('mouseup', stopBoardPan)
    window.removeEventListener('blur', stopBoardPan)
  }

  if (!auth.session) return null

  if (isBootstrapping) {
    return (
      <section className="page-shell">
        <div className="shell-card">
          <p className="eyebrow">Пространство</p>
          <h2>Открываем канбан</h2>
          <p className="body-copy">Scrumbun загружает доски, колонки, задачи и участников.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="control-shell">
      <AppHeader
        menuItems={[
          { kind: 'link', label: 'Главная', to: '/' },
          { kind: 'link', label: 'Все доски', to: selectedBoard ? `/boards?board=${selectedBoard.id}` : '/boards' },
          {
            kind: 'action',
            label: 'Участники',
            disabled: !selectedBoard || !canManageSelectedBoard,
            onSelect: openBoardMembersModal
          },
          {
            kind: 'action',
            label: 'Настройки доски',
            disabled: !selectedBoard || !canManageSelectedBoard,
            onSelect: openBoardSettingsModal
          },
          {
            kind: 'link',
            label: 'Модерация',
            to: '/admin',
            hidden: auth.session?.user.role !== 'admin'
          },
          {
            kind: 'action',
            label: 'Выйти',
            danger: true,
            onSelect: () => {
              auth.logout().catch(() => undefined)
            }
          }
        ]}
        title={selectedBoard ? `${selectedBoard.slug.toUpperCase()} // КАНБАН` : 'SCRUMBUN // КАНБАН'}
      />

      <section className="board-directory">
        <div className="board-directory-header">
          <div className="board-directory-copy">
            <div className="board-directory-label">Текущий канбан</div>
            <div className="board-directory-meta">
              {selectedBoard
                ? `${selectedBoard.description ?? 'Описание не заполнено'} // ${selectedBoard.members.length} участников // ${selectedBoard.columns.length} колонок`
                : 'Откройте страницу со всеми досками, чтобы выбрать рабочее пространство.'}
            </div>
          </div>
          <div className="board-directory-actions">
            <button
              className="btn-new"
              disabled={!selectedBoard || Boolean(selectedBoard.archivedAt)}
              onClick={openCreateTaskModal}
              type="button"
            >
              Новая задача
            </button>
          </div>
        </div>
      </section>

      {errorMessage ? <p className="feedback error board-feedback">{errorMessage}</p> : null}

      {selectedBoard ? (
        <main
          className={`board-container ${isBoardPanning ? 'is-panning' : ''}`}
          onMouseDown={startBoardPan}
          ref={boardRef}
        >
          {boardColumns.map((column) => {
            const columnTasks = tasks.filter((task) => task.columnId === column.id)

            return (
              <section
                className={`column ${dropColumnId === column.id ? 'is-drop-target' : ''}`}
                key={column.id}
                onDragLeave={(event) => {
                  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
                    setDropColumnId((current) => (current === column.id ? null : current))
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (draggedTaskId) {
                    event.dataTransfer.dropEffect = 'move'
                    setDropColumnId(column.id)
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const draggedTask = tasks.find((task) => task.id === draggedTaskId)
                  setDropColumnId(null)

                  if (draggedTask && !draggedTask.archivedAt && draggedTask.columnId !== column.id) {
                    handleTaskMove(draggedTask, column.id).catch(() => undefined)
                  }

                  setDraggedTaskId(null)
                }}
                style={buildAccentVars(column.color)}
              >
                <div className="col-header">
                  <div className="col-heading">
                    <span className="col-accent-dot" />
                    <span className="col-title">{column.name}</span>
                  </div>
                  <span className="col-count">{String(columnTasks.length).padStart(2, '0')}</span>
                </div>
                <div className="col-content">
                  {columnTasks.length === 0 ? (
                    <div className="empty-state">
                      {selectedBoard.archivedAt
                        ? 'Доска в архиве.'
                        : `В колонке "${column.name}" пока пусто.`}
                    </div>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskBoardCard
                        columns={boardColumns}
                        draggedTaskId={draggedTaskId}
                        key={task.id}
                        memberColors={memberColors}
                        onArchiveToggle={handleTaskArchiveToggle}
                        onDelete={handleTaskDelete}
                        onDragEnd={() => {
                          setDraggedTaskId(null)
                          setDropColumnId(null)
                        }}
                        onDragStart={(item) => setDraggedTaskId(item.id)}
                        onMove={handleTaskMove}
                        onOpen={openEditTaskModal}
                        task={task}
                        users={users}
                      />
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </main>
      ) : (
        <section className="board-empty-state">
          <div className="shell-card">
            <p className="eyebrow">Пространство</p>
            <h2>Откройте страницу досок</h2>
            <p className="body-copy">
              Выберите существующую доску, создайте новую или войдите по коду приглашения.
            </p>
            <div className="landing-actions">
              <Link className="btn-new" to="/boards">
                Все доски
              </Link>
            </div>
          </div>
        </section>
      )}

      <div className={`modal ${taskModal ? 'is-open' : ''}`} aria-hidden={taskModal ? 'false' : 'true'}>
        <div
          aria-labelledby="task-modal-title"
          aria-modal="true"
          className="modal-panel"
          role="dialog"
        >
          <div className="modal-header">
            <div className="modal-title" id="task-modal-title">
              {taskModal?.mode === 'edit' ? 'Редактирование задачи' : 'Новая задача'}
            </div>
            <button
              aria-label="Закрыть окно"
              className="icon-btn"
              onClick={closeTaskModal}
              type="button"
            >
              x
            </button>
          </div>

          <div className="task-form">
            <div className="field-wrap">
              <label className="field-label" htmlFor="task-title">
                Название
              </label>
              <input
                className="modal-input"
                id="task-title"
                onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                value={taskForm.title}
              />
            </div>

            <div className="field-wrap">
              <label className="field-label" htmlFor="task-description">
                Описание
              </label>
              <textarea
                className="textarea"
                id="task-description"
                onChange={(event) =>
                  setTaskForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={5}
                value={taskForm.description}
              />
            </div>

            <div className="form-grid">
              <div className="field-wrap">
                <label className="field-label" htmlFor="task-assignee">
                  Исполнитель
                </label>
                <select
                  className="select"
                  id="task-assignee"
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, assigneeId: event.target.value }))
                  }
                  value={taskForm.assigneeId}
                >
                  <option value="">Без исполнителя</option>
                  {boardParticipants.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-wrap">
                <label className="field-label" htmlFor="task-date">
                  Срок
                </label>
                <input
                  className="modal-input"
                  id="task-date"
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, dueDate: event.target.value }))
                  }
                  type="datetime-local"
                  value={taskForm.dueDate}
                />
              </div>

              <div className="field-wrap form-grid-span">
                <label className="field-label" htmlFor="task-column">
                  Колонка
                </label>
                <select
                  className="select"
                  id="task-column"
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, columnId: event.target.value }))
                  }
                  value={taskForm.columnId}
                >
                  {boardColumns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <div className="hint">Задачи работают с реальными колонками доски и могут удаляться навсегда.</div>
              <div className="footer-actions">
                {selectedTask ? (
                  <>
                    <button
                      className="danger-btn"
                      onClick={() => {
                        handleTaskArchiveToggle(selectedTask).catch(() => undefined)
                      }}
                      type="button"
                    >
                      {selectedTask.archivedAt ? 'Вернуть' : 'В архив'}
                    </button>
                    <button
                      className="ghost-btn"
                      onClick={() => {
                        handleTaskDelete(selectedTask).catch(() => undefined)
                      }}
                      type="button"
                    >
                      Удалить навсегда
                    </button>
                  </>
                ) : null}
                <button className="ghost-btn" onClick={closeTaskModal} type="button">
                  Отмена
                </button>
                <button
                  className="btn-new"
                  disabled={isTaskSubmitting}
                  onClick={() => {
                    handleTaskSubmit().catch(() => undefined)
                  }}
                  type="button"
                >
                  {isTaskSubmitting ? 'Сохраняем...' : 'Сохранить задачу'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`modal ${boardModal ? 'is-open' : ''}`} aria-hidden={boardModal ? 'false' : 'true'}>
        <div
          aria-labelledby="board-modal-title"
          aria-modal="true"
          className="modal-panel modal-panel-wide"
          role="dialog"
        >
          <div className="modal-header">
            <div className="modal-title" id="board-modal-title">
              {boardModal?.mode === 'members' ? 'Участники доски' : 'Настройки доски'}
            </div>
            <button
              aria-label="Закрыть окно"
              className="icon-btn"
              onClick={closeBoardModal}
              type="button"
            >
              x
            </button>
          </div>

          <div className="task-form">
            {boardModal?.mode === 'settings' ? (
              <section className="settings-section">
                <div className="field-wrap">
                  <label className="field-label" htmlFor="board-name">
                    Название
                  </label>
                  <input
                    className="modal-input"
                    id="board-name"
                    onChange={(event) => {
                      const nextName = event.target.value
                      setBoardForm((current) => ({ ...current, name: nextName }))
                    }}
                    value={boardForm.name}
                  />
                </div>

                <div className="form-grid">
                  <div className="field-wrap">
                    <label className="field-label" htmlFor="board-slug">
                      Короткий код
                    </label>
                    <input
                      className="modal-input"
                      id="board-slug"
                      onChange={(event) =>
                        setBoardForm((current) => ({ ...current, slug: event.target.value }))
                      }
                      value={boardForm.slug}
                    />
                  </div>

                  <div className="field-wrap">
                    <label className="field-label" htmlFor="board-description">
                      Описание
                    </label>
                    <textarea
                      className="textarea"
                      id="board-description"
                      onChange={(event) =>
                        setBoardForm((current) => ({ ...current, description: event.target.value }))
                      }
                      rows={3}
                      value={boardForm.description}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {boardModal?.mode === 'members' && selectedBoard ? (
              <section className="settings-section">
                <div className="settings-card invite-code-card">
                  <div className="settings-section-header">
                    <div>
                      <div className="field-label">Код приглашения</div>
                      <div className="hint">
                        Новые участники могут вступать в доску по этому коду. После перегенерации старый код
                        сразу перестанет работать.
                      </div>
                    </div>
                    <button
                      className="ghost-btn"
                      disabled={isInviteCodeSubmitting}
                      onClick={() => {
                        handleRegenerateInviteCode().catch(() => undefined)
                      }}
                      type="button"
                    >
                      {isInviteCodeSubmitting ? 'Обновляем...' : 'Перегенерировать код'}
                    </button>
                  </div>
                  <div className="invite-code-value">{selectedBoard.inviteCode ?? 'Код недоступен'}</div>
                </div>

                <div className="settings-section-header">
                  <div>
                    <div className="field-label">Участники</div>
                    <div className="hint">
                      Новые участники входят по коду, а здесь вы задаете персональные цвета и контролируете
                      состав доски.
                    </div>
                  </div>
                  <div className="board-members-note">
                    Цвет участника сразу используется на карточках задач, чтобы исполнитель читался быстрее.
                  </div>
                </div>

                <div className="settings-list">
                  {selectedBoard.members.map((member) => {
                    const color = memberColorDrafts[member.userId] ?? member.color

                    return (
                      <div
                        className="settings-row settings-row-member"
                        key={member.userId}
                        style={buildAccentVars(color)}
                      >
                        <div className="settings-row-main">
                          <strong>{member.user.displayName}</strong>
                          <span>
                            {member.user.email}
                            {member.userId === selectedBoard.ownerId ? ' // владелец' : ''}
                          </span>
                        </div>
                        <div className="settings-row-actions">
                          <div className={`role-pill ${member.user.role === 'admin' ? 'is-admin' : ''}`}>
                            {formatRoleLabel(member.user.role)}
                          </div>
                          <ColorField
                            color={color}
                            id={`member-color-${member.userId}`}
                            label="Цвет"
                            onChange={(nextColor) =>
                              setMemberColorDrafts((current) => ({ ...current, [member.userId]: nextColor }))
                            }
                          />
                          <button
                            className="ghost-btn"
                            disabled={memberColorTargetId === member.userId}
                            onClick={() => {
                              handleSaveMemberColor(member.userId).catch(() => undefined)
                            }}
                            type="button"
                          >
                            {memberColorTargetId === member.userId ? 'Сохраняем...' : 'Сохранить'}
                          </button>
                          {member.userId !== selectedBoard.ownerId ? (
                            <button
                              className="ghost-btn"
                              onClick={() => {
                                handleRemoveMember(member.userId).catch(() => undefined)
                              }}
                              type="button"
                            >
                              Убрать
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null}

            {boardModal?.mode === 'settings' && selectedBoard ? (
              <section className="settings-section">
                <div className="settings-section-header">
                  <div>
                    <div className="field-label">Колонки</div>
                    <div className="hint">
                      Порядок, названия, цвета и удаление колонок без переполнения модалки.
                    </div>
                  </div>
                </div>

                <div className="settings-list">
                  {selectedBoard.columns.map((column, index) => {
                    const draft = columnDrafts[column.id] ?? {
                      name: column.name,
                      slug: column.slug,
                      color: column.color,
                      destinationColumnId: ''
                    }
                    const taskCount = tasks.filter((task) => task.columnId === column.id).length

                    return (
                      <div
                        className="settings-card settings-column-card"
                        key={column.id}
                        style={buildAccentVars(draft.color)}
                      >
                        <div className="settings-card-grid settings-card-grid-wide">
                          <div className="field-wrap">
                            <label className="field-label" htmlFor={`column-name-${column.id}`}>
                              Название
                            </label>
                            <input
                              className="modal-input"
                              id={`column-name-${column.id}`}
                              onChange={(event) =>
                                setColumnDrafts((current) => ({
                                  ...current,
                                  [column.id]: { ...draft, name: event.target.value }
                                }))
                              }
                              value={draft.name}
                            />
                          </div>

                          <div className="field-wrap">
                            <label className="field-label" htmlFor={`column-slug-${column.id}`}>
                              Slug
                            </label>
                            <input
                              className="modal-input"
                              id={`column-slug-${column.id}`}
                              onChange={(event) =>
                                setColumnDrafts((current) => ({
                                  ...current,
                                  [column.id]: { ...draft, slug: event.target.value }
                                }))
                              }
                              value={draft.slug}
                            />
                          </div>

                          <ColorField
                            color={draft.color}
                            id={`column-color-${column.id}`}
                            label="Цвет"
                            onChange={(nextColor) =>
                              setColumnDrafts((current) => ({
                                ...current,
                                [column.id]: { ...draft, color: nextColor }
                              }))
                            }
                          />
                        </div>

                        <div className="settings-row-meta">
                          <span>
                            Позиция {index + 1} // {taskCount} задач(и)
                          </span>
                          {taskCount > 0 ? (
                            <div className="settings-inline-select">
                              <label className="field-label" htmlFor={`column-destination-${column.id}`}>
                                Перенести задачи в
                              </label>
                              <select
                                className="select"
                                id={`column-destination-${column.id}`}
                                onChange={(event) =>
                                  setColumnDrafts((current) => ({
                                    ...current,
                                    [column.id]: { ...draft, destinationColumnId: event.target.value }
                                  }))
                                }
                                value={draft.destinationColumnId}
                              >
                                <option value="">Выберите колонку</option>
                                {selectedBoard.columns
                                  .filter((item) => item.id !== column.id)
                                  .map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          ) : null}
                        </div>

                        <div className="settings-row-actions">
                          <button
                            className="ghost-btn"
                            disabled={index === 0}
                            onClick={() => {
                              handleMoveColumn(column.id, -1).catch(() => undefined)
                            }}
                            type="button"
                          >
                            Выше
                          </button>
                          <button
                            className="ghost-btn"
                            disabled={index === selectedBoard.columns.length - 1}
                            onClick={() => {
                              handleMoveColumn(column.id, 1).catch(() => undefined)
                            }}
                            type="button"
                          >
                            Ниже
                          </button>
                          <button
                            className="btn-new"
                            onClick={() => {
                              handleSaveColumn(column.id).catch(() => undefined)
                            }}
                            type="button"
                          >
                            Сохранить
                          </button>
                          <button
                            className="ghost-btn"
                            disabled={selectedBoard.columns.length <= 1}
                            onClick={() => {
                              handleDeleteColumn(column).catch(() => undefined)
                            }}
                            type="button"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="settings-card settings-column-card" style={buildAccentVars(newColumnForm.color)}>
                  <div className="settings-card-grid settings-card-grid-wide">
                    <div className="field-wrap">
                      <label className="field-label" htmlFor="new-column-name">
                        Новая колонка
                      </label>
                      <input
                        className="modal-input"
                        id="new-column-name"
                        onChange={(event) =>
                          setNewColumnForm((current) => ({ ...current, name: event.target.value }))
                        }
                        value={newColumnForm.name}
                      />
                    </div>

                    <div className="field-wrap">
                      <label className="field-label" htmlFor="new-column-slug">
                        Slug
                      </label>
                      <input
                        className="modal-input"
                        id="new-column-slug"
                        onChange={(event) =>
                          setNewColumnForm((current) => ({ ...current, slug: event.target.value }))
                        }
                        value={newColumnForm.slug}
                      />
                    </div>

                    <ColorField
                      color={newColumnForm.color}
                      id="new-column-color"
                      label="Цвет"
                      onChange={(nextColor) =>
                        setNewColumnForm((current) => ({ ...current, color: nextColor }))
                      }
                    />
                  </div>

                  <div className="settings-row-actions">
                    <button
                      className="btn-new"
                      disabled={isColumnSubmitting}
                      onClick={() => {
                        handleCreateColumn().catch(() => undefined)
                      }}
                      type="button"
                    >
                      {isColumnSubmitting ? 'Добавляем...' : 'Добавить колонку'}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            <div className="modal-footer">
              <div className="hint">
                {boardModal?.mode === 'members'
                  ? 'Код приглашения и цвета команды управляются в одном месте.'
                  : 'Архив оставлен для мягкого скрытия, а полное удаление вынесено отдельно.'}
              </div>
              <div className="footer-actions">
                {boardModal?.mode === 'settings' && selectedBoard ? (
                  <>
                    <button className="danger-btn" onClick={handleBoardArchiveToggle} type="button">
                      {selectedBoard.archivedAt ? 'Вернуть доску' : 'В архив'}
                    </button>
                    <button className="ghost-btn" onClick={handleBoardDelete} type="button">
                      Удалить навсегда
                    </button>
                  </>
                ) : null}
                <button className="ghost-btn" onClick={closeBoardModal} type="button">
                  Отмена
                </button>
                {boardModal?.mode !== 'members' ? (
                  <button
                    className="btn-new"
                    disabled={isBoardSubmitting}
                    onClick={() => {
                      handleBoardSubmit().catch(() => undefined)
                    }}
                    type="button"
                  >
                    {isBoardSubmitting ? 'Сохраняем...' : 'Сохранить доску'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
