import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { DashboardPage } from '../modules/dashboard/dashboard-page'
import { BoardsPage } from '../modules/boards/boards-page'
import { AdminPage } from '../modules/admin/admin-page'
import { AuthPage } from '../modules/auth/auth-page'
import { VerificationPendingPage, VerifyEmailPage } from '../modules/auth/email-verification-page'
import { HomePage } from '../modules/home/home-page'
import { useAuth } from '../modules/auth/auth-context'

function AuthStatusScreen({ title, body }: { title: string; body: string }) {
  return (
    <section className="page-shell">
      <div className="shell-card">
        <p className="eyebrow">Сессия</p>
        <h2>{title}</h2>
        <p className="body-copy">{body}</p>
      </div>
    </section>
  )
}

function ProtectedRoute() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return (
      <AuthStatusScreen
        title="Проверяем вашу сессию"
        body="Scrumbun восстанавливает доступ и подготавливает рабочее пространство."
      />
    )
  }

  if (auth.status === 'anonymous') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

function AnonymousOnlyRoute() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return (
      <AuthStatusScreen
        title="Подготавливаем форму входа"
        body="Клиент сначала проверяет, нет ли уже активной сессии, а затем открывает форму."
      />
    )
  }

  if (auth.status === 'authenticated') {
    return <Navigate to="/app" replace />
  }

  return <Outlet />
}

function AdminOnlyRoute() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return (
      <AuthStatusScreen
        title="Проверяем доступ администратора"
        body="Scrumbun восстанавливает сессию и смотрит, нужно ли открыть модерацию."
      />
    )
  }

  if (auth.status !== 'authenticated') {
    return <Navigate to="/login" replace />
  }

  if (auth.session?.user.role !== 'admin') {
    return <Navigate to="/app" replace />
  }

  return <Outlet />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />

      <Route element={<AnonymousOnlyRoute />}>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
      </Route>

      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/verify-email/pending" element={<VerificationPendingPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/boards" element={<BoardsPage />} />
        <Route path="/app" element={<DashboardPage />} />
      </Route>

      <Route element={<AdminOnlyRoute />}>
        <Route path="/admin" element={<AdminPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
