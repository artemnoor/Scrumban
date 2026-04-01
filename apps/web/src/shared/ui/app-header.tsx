import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../modules/auth/auth-context'

type HeaderMenuItem =
  | {
      kind: 'link'
      label: string
      to: string
      danger?: boolean
      disabled?: boolean
      hidden?: boolean
      onSelect?(): void
    }
  | {
      kind: 'action'
      label: string
      onSelect(): void | Promise<void>
      danger?: boolean
      disabled?: boolean
      hidden?: boolean
    }

function getInitials(input: string) {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function formatRoleLabel(role: 'user' | 'admin') {
  return role === 'admin' ? 'Админ' : 'Участник'
}

export function AppHeader({
  extraActions,
  guestActions,
  menuItems,
  status,
  title
}: {
  extraActions?: ReactNode
  guestActions?: ReactNode
  menuItems?: HeaderMenuItem[]
  status?: string
  title: string
}) {
  const auth = useAuth()
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)

  const visibleMenuItems = useMemo(
    () => (menuItems ?? []).filter((item) => !item.hidden),
    [menuItems]
  )

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setIsProfileMenuOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return (
    <header className="topbar">
      <div className="project-title">{title}</div>

      <div className="topbar-actions">
        {status ? <div className="board-status">{status}</div> : null}
        {auth.session ? (
          <>
            {extraActions}
            <div className={`profile-menu ${isProfileMenuOpen ? 'is-open' : ''}`} ref={profileMenuRef}>
              <button
                className="profile-menu-trigger"
                onClick={() => setIsProfileMenuOpen((current) => !current)}
                type="button"
              >
                <span className="profile-chip">
                  <span className="profile-avatar">
                    {getInitials(auth.session.user.displayName) || 'П'}
                  </span>
                  <span className="profile-copy">
                    <span className="profile-name">{auth.session.user.displayName}</span>
                    <span className="profile-role">{formatRoleLabel(auth.session.user.role)}</span>
                  </span>
                </span>
                <span aria-hidden="true" className="menu-burger">
                  <span />
                  <span />
                  <span />
                </span>
              </button>

              {isProfileMenuOpen ? (
                <div className="profile-menu-dropdown">
                  {visibleMenuItems.map((item) =>
                    item.kind === 'link' ? (
                      <Link
                        className={`profile-menu-item ${item.danger ? 'is-danger' : ''}`}
                        key={`${item.kind}-${item.label}-${item.to}`}
                        onClick={() => {
                          setIsProfileMenuOpen(false)
                          item.onSelect?.()
                        }}
                        to={item.to}
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <button
                        className={`profile-menu-item ${item.danger ? 'is-danger' : ''}`}
                        disabled={item.disabled}
                        key={`${item.kind}-${item.label}`}
                        onClick={() => {
                          setIsProfileMenuOpen(false)
                          item.onSelect()
                        }}
                        type="button"
                      >
                        {item.label}
                      </button>
                    )
                  )}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          guestActions
        )}
      </div>
    </header>
  )
}
