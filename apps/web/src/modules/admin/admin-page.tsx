import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import type { ModerationOverviewDto } from '@scrumbun/shared/admin'
import type { BoardDto } from '@scrumbun/shared/tasks'
import { useAuth } from '../auth/auth-context'
import { createBrowserLogger } from '../../shared/logger'
import { listBoards } from '../boards/api'
import {
  adminDeleteBoard,
  adminDeleteTask,
  adminSetBoardArchived,
  adminSetTaskArchived,
  adminSetTaskAssignment,
  adminSetTaskColumn,
  getModerationOverview
} from './api'
import { AppHeader } from '../../shared/ui/app-header'

const logger = createBrowserLogger('apps/web/admin-page')

function formatRoleLabel(role: 'user' | 'admin') {
  return role === 'admin' ? 'Админ' : 'Участник'
}

export function AdminPage() {
  const auth = useAuth()
  const [overview, setOverview] = useState<ModerationOverviewDto | null>(null)
  const [boards, setBoards] = useState<BoardDto[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function refreshOverview() {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const [nextOverview, nextBoards] = await Promise.all([getModerationOverview(), listBoards(true)])
      setOverview(nextOverview)
      setBoards(nextBoards)
      logger.info('Moderation overview loaded', {
        archivedBoards: nextOverview.counts.archivedBoards,
        archivedTasks: nextOverview.counts.archivedTasks
      })
    } catch (error) {
      logger.error('Moderation overview failed to load', {
        message: error instanceof Error ? error.message : 'Unknown admin error'
      })
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить модерацию')
    } finally {
      setIsLoading(false)
    }
  }

  const boardMap = useMemo(() => new Map(boards.map((board) => [board.id, board])), [boards])

  useEffect(() => {
    refreshOverview().catch(() => undefined)
  }, [])

  if (!auth.session) return null

  if (isLoading) {
    return (
      <section className="page-shell">
        <div className="shell-card">
          <p className="eyebrow">Модерация</p>
          <h2>Открываем панель администратора</h2>
          <p className="body-copy">Scrumbun собирает архив, пользователей и инструменты удаления.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="control-shell admin-control-shell">
      <AppHeader
        menuItems={[
          { kind: 'link', label: 'Главная', to: '/' },
          { kind: 'link', label: 'Все доски', to: '/boards' },
          { kind: 'link', label: 'Канбан', to: '/app' },
          { kind: 'link', label: 'Модерация', to: '/admin' },
          {
            kind: 'action',
            label: 'Выйти',
            danger: true,
            onSelect: () => {
              auth.logout().catch(() => undefined)
            }
          }
        ]}
        status="Архив, удаление, перенос задач и переназначение"
        title="SCRUMBUN // МОДЕРАЦИЯ"
      />
      {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}
      {overview ? (
        <>
          <section className="board-directory">
            <div className="board-directory-copy">
              <div className="board-directory-label">Сводка платформы</div>
              <div className="board-directory-meta">
                {overview.counts.activeBoards} активных досок // {overview.counts.archivedBoards} в архиве // {overview.counts.archivedTasks} архивных задач // {overview.counts.users} пользователей
              </div>
            </div>
          </section>
          <main className="board-container admin-board-container">
            <section className="column">
              <div className="col-header"><span className="col-title">Архив досок</span><span className="col-count">{String(overview.archivedBoards.length).padStart(2, '0')}</span></div>
              <div className="col-content">
                {overview.archivedBoards.length === 0 ? <div className="empty-state">Сейчас в архиве нет ни одной доски.</div> : overview.archivedBoards.map((board) => (
                  <article className="card" key={board.id}>
                    <div className="card-title">{board.name}</div>
                    <div className="card-subtitle">{board.description ?? 'Описание не заполнено'}</div>
                    <div className="admin-card-controls">
                      <button className="card-move-btn" onClick={() => { adminSetBoardArchived(board.id, { archived: false }).then(() => refreshOverview()).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Не удалось вернуть доску')) }} type="button">Вернуть доску</button>
                      <button className="card-move-btn is-danger-lite" onClick={() => { if (!window.confirm(`Удалить доску "${board.name}" навсегда?`)) return; adminDeleteBoard(board.id).then(() => refreshOverview()).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить доску')) }} type="button">Удалить навсегда</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="column">
              <div className="col-header"><span className="col-title">Архив задач</span><span className="col-count">{String(overview.archivedTasks.length).padStart(2, '0')}</span></div>
              <div className="col-content">
                {overview.archivedTasks.length === 0 ? <div className="empty-state">Архивных задач, ожидающих восстановления, нет.</div> : overview.archivedTasks.map((task) => {
                  const board = boardMap.get(task.boardId)
                  const columns = board?.columns ?? []
                  return (
                    <article className="card" key={task.id}>
                      <div className="card-title">{task.title}</div>
                      <div className="card-subtitle">{board ? `${board.name} // ${task.description ?? 'Описание не заполнено'}` : task.description ?? 'Описание не заполнено'}</div>
                      <div className="admin-card-controls">
                        <select className="select" onChange={(event) => { adminSetTaskColumn(task.id, { columnId: event.target.value }).then(() => refreshOverview()).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Не удалось изменить колонку задачи')) }} value={task.columnId}>
                          {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
                        </select>
                        <select className="select" onChange={(event) => { adminSetTaskAssignment(task.id, { assigneeId: event.target.value || null }).then(() => refreshOverview()).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Не удалось изменить исполнителя')) }} value={task.assigneeId ?? ''}>
                          <option value="">Без исполнителя</option>
                          {overview.users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
                        </select>
                        <button className="card-move-btn" onClick={() => { adminSetTaskArchived(task.id, { archived: false }).then(() => refreshOverview()).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Не удалось вернуть задачу')) }} type="button">Вернуть задачу</button>
                        <button className="card-move-btn is-danger-lite" onClick={() => { if (!window.confirm(`Удалить задачу "${task.title}" навсегда?`)) return; adminDeleteTask(task.id).then(() => refreshOverview()).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить задачу')) }} type="button">Удалить навсегда</button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
            <section className="column">
              <div className="col-header"><span className="col-title">Пользователи</span><span className="col-count">{String(overview.users.length).padStart(2, '0')}</span></div>
              <div className="col-content">
                {overview.users.map((user) => (
                  <article className="card" key={user.id}>
                    <div className="card-title">{user.displayName}</div>
                    <div className="card-subtitle">{user.email}</div>
                    <div className="card-footer">
                      <div className={`role-pill ${user.role === 'admin' ? 'is-admin' : ''}`}>{formatRoleLabel(user.role)}</div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </main>
        </>
      ) : null}
    </section>
  )
}
