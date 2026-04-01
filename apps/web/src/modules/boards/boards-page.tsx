import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import type { BoardDto } from '@scrumbun/shared/tasks'
import { useAuth } from '../auth/auth-context'
import { createBrowserLogger } from '../../shared/logger'
import { createBoard, joinBoardByInviteCode, listBoards } from './api'
import { AppHeader } from '../../shared/ui/app-header'

const logger = createBrowserLogger('apps/web/boards-page')

type PanelMode = 'create' | 'join'

function slugify(input: string) {
  return input.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
}

export function BoardsPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeBoardId = searchParams.get('board')
  const [boards, setBoards] = useState<BoardDto[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [panelMode, setPanelMode] = useState<PanelMode>('create')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [boardForm, setBoardForm] = useState({ name: '', slug: '', description: '' })
  const [joinCode, setJoinCode] = useState('')

  const activeBoard = useMemo(
    () => boards.find((board) => board.id === activeBoardId) ?? boards.find((board) => !board.archivedAt) ?? boards[0] ?? null,
    [activeBoardId, boards]
  )

  async function refreshBoards() {
    const nextBoards = await listBoards(true)
    setBoards(nextBoards)
    return nextBoards
  }

  useEffect(() => {
    async function bootstrap() {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const nextBoards = await refreshBoards()
        logger.info('Boards management loaded', {
          boards: nextBoards.length
        })
      } catch (error) {
        logger.error('Boards management failed to load', {
          message: error instanceof Error ? error.message : 'Unknown boards error'
        })
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить доски')
      } finally {
        setIsLoading(false)
      }
    }

    bootstrap().catch(() => undefined)
  }, [])

  async function handleCreateBoard() {
    if (!boardForm.name.trim()) {
      setErrorMessage('Укажите название доски')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const board = await createBoard({
        name: boardForm.name.trim(),
        slug: boardForm.slug.trim() || slugify(boardForm.name),
        description: boardForm.description.trim() || undefined
      })
      await refreshBoards()
      navigate(`/app?board=${board.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать доску')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleJoinBoard() {
    if (!joinCode.trim()) {
      setErrorMessage('Введите код приглашения')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const board = await joinBoardByInviteCode({
        inviteCode: joinCode.trim()
      })
      await refreshBoards()
      navigate(`/app?board=${board.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось вступить в доску')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!auth.session) {
    return null
  }

  if (isLoading) {
    return (
      <section className="page-shell">
        <div className="shell-card">
          <p className="eyebrow">Доски</p>
          <h2>Открываем список досок</h2>
          <p className="body-copy">Scrumbun собирает ваши пространства, чтобы можно было быстро выбрать нужное.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="control-shell boards-control-shell">
      <AppHeader
        menuItems={[
          { kind: 'link', label: 'Главная', to: '/' },
          { kind: 'link', label: 'Все доски', to: activeBoard ? `/boards?board=${activeBoard.id}` : '/boards' },
          { kind: 'link', label: 'Канбан', to: activeBoard ? `/app?board=${activeBoard.id}` : '/app' },
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
        status="Каталог досок, создание новой и вход по приглашению"
        title="SCRUMBUN // ВСЕ ДОСКИ"
      />

      <section className="boards-hero">
        <div className="boards-hero-layout">
          <div className="shell-card boards-hero-card">
            <p className="eyebrow">Пространства</p>
            <h1>Открой нужную доску или создай новую точку работы.</h1>
            <p className="lede">
              Здесь живет все управление досками: переход между пространствами, создание новой доски
              и вход по коду приглашения без лишних действий внутри канбана.
            </p>

            <div className="boards-hero-actions">
              <button
                className={panelMode === 'create' ? 'btn-new' : 'ghost-btn'}
                onClick={() => setPanelMode('create')}
                type="button"
              >
                Новая доска
              </button>
              <button
                className={panelMode === 'join' ? 'btn-new' : 'ghost-btn'}
                onClick={() => setPanelMode('join')}
                type="button"
              >
                Вступить по коду
              </button>
            </div>

            <div className="boards-hero-meta">
              <span>{String(boards.filter((board) => !board.archivedAt).length).padStart(2, '0')} активных</span>
              <span>{String(boards.filter((board) => board.archivedAt).length).padStart(2, '0')} в архиве</span>
              <span>{String(boards.length).padStart(2, '0')} всего</span>
            </div>
          </div>

          <aside className="shell-card boards-panel-card">
            {panelMode === 'create' ? (
              <div className="task-form">
                <div className="modal-title">Новая доска</div>
                <div className="field-wrap">
                  <label className="field-label" htmlFor="create-board-name">
                    Название
                  </label>
                  <input
                    className="modal-input"
                    id="create-board-name"
                    onChange={(event) => {
                      const nextName = event.target.value
                      setBoardForm((current) => ({
                        ...current,
                        name: nextName,
                        slug: !current.slug.trim() ? slugify(nextName) : current.slug
                      }))
                    }}
                    value={boardForm.name}
                  />
                </div>
                <div className="field-wrap">
                  <label className="field-label" htmlFor="create-board-slug">
                    Короткий код
                  </label>
                  <input
                    className="modal-input"
                    id="create-board-slug"
                    onChange={(event) =>
                      setBoardForm((current) => ({ ...current, slug: event.target.value }))
                    }
                    value={boardForm.slug}
                  />
                </div>
                <div className="field-wrap">
                  <label className="field-label" htmlFor="create-board-description">
                    Описание
                  </label>
                  <textarea
                    className="textarea"
                    id="create-board-description"
                    onChange={(event) =>
                      setBoardForm((current) => ({ ...current, description: event.target.value }))
                    }
                    rows={4}
                    value={boardForm.description}
                  />
                </div>
                <div className="modal-footer">
                  <div className="hint">После создания откроется сама доска с уже сгенерированным кодом приглашения.</div>
                  <div className="footer-actions">
                    <button className="btn-new" disabled={isSubmitting} onClick={() => { handleCreateBoard().catch(() => undefined) }} type="button">
                      {isSubmitting ? 'Создаем...' : 'Создать и открыть'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="task-form">
                <div className="modal-title">Вступить по коду</div>
                <div className="field-wrap">
                  <label className="field-label" htmlFor="join-board-code-page">
                    Код приглашения
                  </label>
                  <input
                    className="modal-input invite-code-input"
                    id="join-board-code-page"
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    placeholder="Например: A7K9Q2LM"
                    value={joinCode}
                  />
                </div>
                <div className="board-members-note">
                  Владелец доски передает этот код команде. После ввода вы сразу попадете в нужное пространство.
                </div>
                <div className="modal-footer">
                  <div className="hint">Если код больше не работает, владелец, вероятно, уже успел его перегенерировать.</div>
                  <div className="footer-actions">
                    <button className="btn-new" disabled={isSubmitting} onClick={() => { handleJoinBoard().catch(() => undefined) }} type="button">
                      {isSubmitting ? 'Подключаем...' : 'Вступить и открыть'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>

      {errorMessage ? <p className="feedback error board-feedback">{errorMessage}</p> : null}

      <section className="board-directory board-directory-standalone">
        <div className="board-directory-header">
          <div className="board-directory-copy">
            <div className="board-directory-label">Каталог досок</div>
            <div className="board-directory-meta">
              {activeBoard
                ? `Сейчас выбрана: ${activeBoard.name}`
                : 'Выберите доску ниже, чтобы открыть ее в рабочем режиме.'}
            </div>
          </div>
        </div>

        <div className="board-pill-list">
          {boards.length === 0 ? (
            <div className="board-management-empty">
              У вас пока нет досок. Создайте первую или войдите по коду приглашения.
            </div>
          ) : (
            boards.map((board) => (
              <button
                className={`board-pill ${activeBoard?.id === board.id ? 'is-active' : ''} ${
                  board.archivedAt ? 'is-archived' : ''
                }`}
                key={board.id}
                onClick={() => navigate(`/app?board=${board.id}`)}
                type="button"
              >
                <div className="board-pill-head">
                  <span className="board-pill-name">{board.name}</span>
                  <span className={`board-pill-state ${board.archivedAt ? 'is-archived' : 'is-live'}`}>
                    {board.archivedAt ? 'Архив' : 'Активна'}
                  </span>
                </div>
                <div className="board-pill-code">{board.slug.toUpperCase()}</div>
                <div className="board-pill-description">
                  {board.description?.trim() || 'Описание доски пока не заполнено.'}
                </div>
                <div className="board-pill-meta">
                  <span>{String(board.columns.length).padStart(2, '0')} колонок</span>
                  <span>{String(board.members.length).padStart(2, '0')} участников</span>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </section>
  )
}
