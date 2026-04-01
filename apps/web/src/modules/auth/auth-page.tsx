import { Link, useNavigate } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import {
  loginInputSchema,
  registerInputSchema,
  type LoginInput,
  type RegisterInput
} from '@scrumbun/shared/auth'
import { useAuth } from './auth-context'
import { createBrowserLogger } from '../../shared/logger'
import { AppHeader } from '../../shared/ui/app-header'

type AuthMode = 'login' | 'register'

const logger = createBrowserLogger('apps/web/auth-page')

function getValidationMessage(
  issues: Array<{ path: Array<string | number> }>,
  isRegister: boolean
) {
  const field = String(issues[0]?.path[0] ?? '')

  if (field === 'displayName') {
    return 'Имя должно содержать от 2 до 120 символов'
  }

  if (field === 'email') {
    return 'Укажите корректный email'
  }

  if (field === 'password') {
    return 'Пароль должен содержать от 8 до 128 символов'
  }

  return isRegister ? 'Проверьте данные регистрации' : 'Проверьте данные для входа'
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [formValues, setFormValues] = useState({
    displayName: '',
    email: '',
    password: ''
  })

  const isRegister = mode === 'register'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    auth.clearError()
    setValidationMessage(null)
    setIsSubmitting(true)

    logger.debug('Auth form submitted', {
      mode,
      email: formValues.email
    })

    try {
      if (isRegister) {
        const payload = registerInputSchema.safeParse({
          displayName: formValues.displayName,
          email: formValues.email,
          password: formValues.password
        })

        if (!payload.success) {
          setValidationMessage(getValidationMessage(payload.error.issues, true))
          return
        }

        const result = await auth.register(payload.data as RegisterInput)
        navigate(`/verify-email/pending?email=${encodeURIComponent(result.email)}`, { replace: true })
      } else {
        const payload = loginInputSchema.safeParse({
          email: formValues.email,
          password: formValues.password
        })

        if (!payload.success) {
          setValidationMessage(getValidationMessage(payload.error.issues, false))
          return
        }

        await auth.login(payload.data as LoginInput)
        navigate('/app', { replace: true })
      }
    } catch (error) {
      logger.warn('Auth submission ended with handled error', {
        mode,
        message: error instanceof Error ? error.message : 'Unknown auth error'
      })

      if (!isRegister && auth.pendingVerification?.email) {
        navigate(`/verify-email/pending?email=${encodeURIComponent(auth.pendingVerification.email)}`, {
          replace: true
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="control-shell auth-control-shell">
      <AppHeader
        guestActions={
          <>
            <Link className="ghost-btn" to="/">
              Главная
            </Link>
            <Link className="ghost-btn" to={isRegister ? '/login' : '/register'}>
              {isRegister ? 'У меня уже есть аккаунт' : 'Создать аккаунт'}
            </Link>
          </>
        }
        status={
          isRegister
            ? 'Создайте первый защищенный доступ для команды'
            : 'Войдите в существующее рабочее пространство'
        }
        title={isRegister ? 'SCRUMBUN // СОЗДАНИЕ АККАУНТА' : 'SCRUMBUN // ВХОД В СИСТЕМУ'}
      />

      <div className="auth-control-grid">
        <div className="shell-card auth-info-card">
          <p className="eyebrow">Доступ</p>
          <h1>{isRegister ? 'Подготовьте вход для команды.' : 'Вернитесь к рабочей доске.'}</h1>
          <p className="lede">
            {isRegister
              ? 'После регистрации Scrumbun отправит реальное письмо подтверждения и только потом откроет полноценный доступ.'
              : 'Вход работает через реальный Fastify API и пропускает в рабочее пространство только подтвержденные аккаунты.'}
          </p>

          <div className="feature-grid">
            <article className="feature-card">
              <span>01</span>
              <strong>Подтвержденный email</strong>
              <p>Новый аккаунт сначала подтверждает адрес, а уже потом получает полный доступ к доскам.</p>
            </article>
            <article className="feature-card">
              <span>02</span>
              <strong>Общие контракты</strong>
              <p>Форма, API и письмо подтверждения работают через общий набор схем без расхождений.</p>
            </article>
          </div>
        </div>

        <div className="auth-form-stage">
          <div className="modal-panel auth-form-panel">
            <form className="auth-form" onSubmit={handleSubmit}>
              <div>
                <p className="eyebrow">Аккаунт</p>
                <h2>{isRegister ? 'Регистрация' : 'Вход'}</h2>
                <p className="body-copy">
                  {isRegister
                    ? 'Создайте аккаунт, получите письмо подтверждения и затем завершите вход.'
                    : 'Войдите под подтвержденным аккаунтом и продолжите работу с досками.'}
                </p>
              </div>

              {isRegister ? (
                <label className="field">
                  <span>Имя</span>
                  <input
                    autoComplete="name"
                    name="displayName"
                    onChange={(event) =>
                      setFormValues((current) => ({ ...current, displayName: event.target.value }))
                    }
                    placeholder="Например, Артем"
                    value={formValues.displayName}
                  />
                </label>
              ) : null}

              <label className="field">
                <span>Email</span>
                <input
                  autoComplete="email"
                  name="email"
                  onChange={(event) =>
                    setFormValues((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="team@scrumbun.dev"
                  type="email"
                  value={formValues.email}
                />
              </label>

              <label className="field">
                <span>Пароль</span>
                <input
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  name="password"
                  onChange={(event) =>
                    setFormValues((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="Не меньше 8 символов"
                  type="password"
                  value={formValues.password}
                />
              </label>

              {validationMessage ? <p className="feedback error">{validationMessage}</p> : null}
              {auth.errorMessage ? <p className="feedback error">{auth.errorMessage}</p> : null}

              <button className="btn-new full-width" disabled={isSubmitting} type="submit">
                {isSubmitting
                  ? 'Отправляем...'
                  : isRegister
                    ? 'Создать аккаунт'
                    : 'Войти'}
              </button>

              <p className="auth-switch">
                {isRegister ? 'Уже есть аккаунт?' : 'Еще нет аккаунта?'}{' '}
                <Link to={isRegister ? '/login' : '/register'}>
                  {isRegister ? 'Войти' : 'Создать его'}
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}
