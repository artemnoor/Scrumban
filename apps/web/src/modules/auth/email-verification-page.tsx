import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AppHeader } from '../../shared/ui/app-header'
import { useAuth } from './auth-context'

type VerifyState = 'checking' | 'success' | 'error'

function formatExpiration(value: string | null) {
  if (!value) {
    return null
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export function VerificationPendingPage() {
  const auth = useAuth()
  const [searchParams] = useSearchParams()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const email = searchParams.get('email') ?? auth.pendingVerification?.email ?? ''
  const expirationLabel = formatExpiration(
    auth.pendingVerification?.email === email ? auth.pendingVerification.verificationExpiresAt : null
  )

  async function handleResend() {
    if (!email) {
      return
    }

    setIsSubmitting(true)
    setSuccessMessage(null)
    auth.clearError()

    try {
      const result = await auth.resendVerification(email)
      const formattedExpiration = formatExpiration(result.verificationExpiresAt)
      setSuccessMessage(
        formattedExpiration
          ? `Письмо отправлено повторно. Ссылка действует до ${formattedExpiration}.`
          : 'Письмо отправлено повторно.'
      )
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
            <Link className="ghost-btn" to="/login">
              Войти
            </Link>
          </>
        }
        status="Подтвердите email, чтобы активировать аккаунт"
        title="SCRUMBUN // ПОДТВЕРЖДЕНИЕ EMAIL"
      />

      <div className="auth-control-grid">
        <div className="shell-card auth-info-card">
          <p className="eyebrow">Почта</p>
          <h1>Мы отправили письмо с подтверждением.</h1>
          <p className="lede">
            Откройте письмо, перейдите по ссылке и после этого войдите в систему как обычно.
          </p>

          <div className="feature-grid">
            <article className="feature-card">
              <span>01</span>
              <strong>Адрес</strong>
              <p>{email || 'Email не найден. Вернитесь к регистрации и отправьте письмо заново.'}</p>
            </article>
            <article className="feature-card">
              <span>02</span>
              <strong>Срок действия</strong>
              <p>{expirationLabel ? `Ссылка активна до ${expirationLabel}.` : 'После повторной отправки срок обновится.'}</p>
            </article>
          </div>
        </div>

        <div className="auth-form-stage">
          <div className="modal-panel auth-form-panel">
            <div className="auth-form auth-status-panel">
              <div>
                <p className="eyebrow">Следующий шаг</p>
                <h2>Подтвердите email</h2>
                <p className="body-copy">
                  Если письмо не пришло, можно отправить ссылку заново. После подтверждения откройте вход и авторизуйтесь.
                </p>
              </div>

              {successMessage ? <p className="feedback success">{successMessage}</p> : null}
              {auth.errorMessage ? <p className="feedback error">{auth.errorMessage}</p> : null}

              <div className="auth-status-actions">
                <button className="btn-new full-width" disabled={!email || isSubmitting} onClick={() => handleResend().catch(() => undefined)} type="button">
                  {isSubmitting ? 'Отправляем...' : 'Отправить письмо еще раз'}
                </button>
                <Link className="ghost-btn full-width auth-secondary-action" to="/login">
                  Перейти ко входу
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function VerifyEmailPage() {
  const auth = useAuth()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<VerifyState>('checking')
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null)
  const verificationAttemptedRef = useRef<string | null>(null)
  const token = searchParams.get('token')

  const title = useMemo(() => {
    switch (state) {
      case 'success':
        return 'Email подтвержден.'
      case 'error':
        return 'Не удалось подтвердить email.'
      default:
        return 'Проверяем ссылку подтверждения.'
    }
  }, [state])

  useEffect(() => {
    auth.clearError()

    if (!token) {
      setState('error')
      return
    }

    if (verificationAttemptedRef.current === token) {
      return
    }

    verificationAttemptedRef.current = token

    let cancelled = false

    auth
      .verifyEmail(token)
      .then((result) => {
        if (cancelled) return
        setVerifiedEmail(result.email)
        setState('success')
      })
      .catch(() => {
        if (cancelled) return
        setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <section className="control-shell auth-control-shell">
      <AppHeader
        guestActions={
          <>
            <Link className="ghost-btn" to="/">
              Главная
            </Link>
            <Link className="ghost-btn" to="/login">
              Войти
            </Link>
          </>
        }
        status="Завершаем активацию аккаунта"
        title="SCRUMBUN // ПРОВЕРКА EMAIL"
      />

      <div className="auth-control-grid">
        <div className="shell-card auth-info-card">
          <p className="eyebrow">Статус</p>
          <h1>{title}</h1>
          <p className="lede">
            {state === 'success'
              ? 'Теперь аккаунт активирован, и можно переходить к обычному входу.'
              : state === 'error'
                ? 'Ссылка могла устареть или уже быть использована. При необходимости отправьте письмо заново.'
                : 'Пожалуйста, подождите несколько секунд, пока система проверяет токен.'}
          </p>
        </div>

        <div className="auth-form-stage">
          <div className="modal-panel auth-form-panel">
            <div className="auth-form auth-status-panel">
              <div>
                <p className="eyebrow">Подтверждение</p>
                <h2>{state === 'success' ? 'Готово' : state === 'error' ? 'Нужна новая ссылка' : 'Проверяем'}</h2>
                <p className="body-copy">
                  {state === 'success'
                    ? `Email ${verifiedEmail ?? ''} успешно подтвержден.`
                    : state === 'error'
                      ? 'Откройте страницу ожидания и отправьте письмо подтверждения повторно.'
                      : 'Если токен валиден, вы сразу увидите успешное подтверждение.'}
                </p>
              </div>

              {auth.errorMessage ? <p className="feedback error">{auth.errorMessage}</p> : null}

              <div className="auth-status-actions">
                {state === 'success' ? (
                  <Link className="btn-new full-width" to="/login">
                    Перейти ко входу
                  </Link>
                ) : null}
                {state === 'error' ? (
                  <Link
                    className="btn-new full-width"
                    to={`/verify-email/pending${verifiedEmail ? `?email=${encodeURIComponent(verifiedEmail)}` : ''}`}
                  >
                    Отправить письмо заново
                  </Link>
                ) : null}
                <Link className="ghost-btn full-width auth-secondary-action" to="/">
                  На главную
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
