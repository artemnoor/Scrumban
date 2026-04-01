import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren
} from 'react'
import {
  authSessionResponseSchema,
  loginInputSchema,
  registerInputSchema,
  registerResponseSchema,
  resendVerificationInputSchema,
  verifyEmailInputSchema,
  verifyEmailResponseSchema,
  type AuthSessionResponseDto,
  type LoginInput,
  type RegisterInput,
  type RegisterResponseDto,
  type VerifyEmailResponseDto
} from '@scrumbun/shared/auth'
import { apiRequest, ApiClientError } from '../../shared/http/api-client'
import { createBrowserLogger } from '../../shared/logger'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

type PendingVerificationState = {
  email: string
  verificationExpiresAt: string | null
}

type AuthContextValue = {
  status: AuthStatus
  session: AuthSessionResponseDto | null
  errorMessage: string | null
  pendingVerification: PendingVerificationState | null
  clearError(): void
  clearPendingVerification(): void
  refreshSession(): Promise<void>
  login(input: LoginInput): Promise<void>
  register(input: RegisterInput): Promise<RegisterResponseDto>
  resendVerification(email: string): Promise<RegisterResponseDto>
  verifyEmail(token: string): Promise<VerifyEmailResponseDto>
  logout(): Promise<void>
}

const logger = createBrowserLogger('apps/web/auth-context')
const AuthContext = createContext<AuthContextValue | null>(null)

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Неожиданная ошибка авторизации'
}

function readPendingVerificationEmail(error: unknown) {
  if (!(error instanceof ApiClientError)) {
    return null
  }

  const details = error.details as { email?: unknown } | undefined
  return typeof details?.email === 'string' ? details.email : null
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [session, setSession] = useState<AuthSessionResponseDto | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingVerification, setPendingVerification] = useState<PendingVerificationState | null>(null)

  async function refreshSession() {
    logger.debug('Refreshing session state')

    try {
      const nextSession = await apiRequest<AuthSessionResponseDto>('/auth/me', {
        schema: authSessionResponseSchema
      })

      setSession(nextSession)
      setStatus('authenticated')
      setPendingVerification(null)
      setErrorMessage(null)

      logger.info('Session refresh succeeded', {
        userId: nextSession.user.id
      })
    } catch (error) {
      logger.warn('Session refresh resolved to anonymous state', {
        message: normalizeErrorMessage(error)
      })
      setSession(null)
      setStatus('anonymous')
    }
  }

  async function login(input: LoginInput) {
    logger.debug('Login requested', {
      email: input.email
    })

    const payload = loginInputSchema.parse(input)

    try {
      const nextSession = await apiRequest<AuthSessionResponseDto, LoginInput>('/auth/login', {
        method: 'POST',
        body: payload,
        schema: authSessionResponseSchema
      })

      setSession(nextSession)
      setStatus('authenticated')
      setPendingVerification(null)
      setErrorMessage(null)

      logger.info('Login completed', {
        userId: nextSession.user.id
      })
    } catch (error) {
      const pendingEmail = readPendingVerificationEmail(error)

      if (pendingEmail) {
        setPendingVerification({
          email: pendingEmail,
          verificationExpiresAt: null
        })
      }

      throw error
    }
  }

  async function register(input: RegisterInput) {
    logger.debug('Register requested', {
      email: input.email
    })

    const payload = registerInputSchema.parse(input)
    const result = await apiRequest<RegisterResponseDto, RegisterInput>('/auth/register', {
      method: 'POST',
      body: payload,
      schema: registerResponseSchema
    })

    setSession(null)
    setStatus('anonymous')
    setPendingVerification({
      email: result.email,
      verificationExpiresAt: result.verificationExpiresAt
    })
    setErrorMessage(null)

    logger.info('Register completed in pending verification mode', {
      email: result.email,
      resent: result.resent
    })

    return result
  }

  async function resendVerification(email: string) {
    logger.debug('Resend verification requested', {
      email
    })

    const payload = resendVerificationInputSchema.parse({ email })
    const result = await apiRequest<RegisterResponseDto, { email: string }>('/auth/resend-verification', {
      method: 'POST',
      body: payload,
      schema: registerResponseSchema
    })

    setPendingVerification({
      email: result.email,
      verificationExpiresAt: result.verificationExpiresAt
    })
    setErrorMessage(null)

    logger.info('Verification resend completed', {
      email: result.email
    })

    return result
  }

  async function verifyEmail(token: string) {
    logger.debug('Verify email requested')

    const payload = verifyEmailInputSchema.parse({ token })
    const result = await apiRequest<VerifyEmailResponseDto, { token: string }>('/auth/verify-email', {
      method: 'POST',
      body: payload,
      schema: verifyEmailResponseSchema
    })

    setPendingVerification(null)
    setErrorMessage(null)

    logger.info('Email verified on frontend state', {
      email: result.email
    })

    return result
  }

  async function logout() {
    logger.debug('Logout requested')

    await apiRequest<void>('/auth/logout', {
      method: 'POST'
    })

    setSession(null)
    setStatus('anonymous')
    setPendingVerification(null)
    setErrorMessage(null)

    logger.info('Logout completed')
  }

  function clearError() {
    setErrorMessage(null)
  }

  function clearPendingVerification() {
    setPendingVerification(null)
  }

  useEffect(() => {
    logger.info('Auth provider mounted')

    refreshSession().catch((error) => {
      logger.error('Initial session refresh failed unexpectedly', {
        message: normalizeErrorMessage(error)
      })
      setSession(null)
      setStatus('anonymous')
      setErrorMessage(normalizeErrorMessage(error))
    })
  }, [])

  async function executeWithErrorBoundary<T>(operation: () => Promise<T>) {
    try {
      return await operation()
    } catch (error) {
      const normalizedMessage = normalizeErrorMessage(error)

      logger.error('Auth operation failed', {
        message: normalizedMessage
      })

      setErrorMessage(normalizedMessage)
      throw error
    }
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        session,
        errorMessage,
        pendingVerification,
        clearError,
        clearPendingVerification,
        refreshSession: () => executeWithErrorBoundary(refreshSession),
        login: (input) => executeWithErrorBoundary(() => login(input)),
        register: (input) => executeWithErrorBoundary(() => register(input)),
        resendVerification: (email) => executeWithErrorBoundary(() => resendVerification(email)),
        verifyEmail: (token) => executeWithErrorBoundary(() => verifyEmail(token)),
        logout: () => executeWithErrorBoundary(logout)
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error('useAuth должен использоваться внутри AuthProvider')
  }

  return value
}
