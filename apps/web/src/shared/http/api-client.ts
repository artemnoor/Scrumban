import { authErrorResponseSchema } from '@scrumbun/shared/auth'
import { getWebEnv } from '../env'
import { createBrowserLogger } from '../logger'

const logger = createBrowserLogger('apps/web/api-client')

const apiErrorMessages: Record<string, string> = {
  ASSIGNEE_NOT_FOUND: 'Исполнитель не найден',
  BAD_REQUEST: 'Некорректный запрос',
  BOARD_ARCHIVED: 'Доска находится в архиве',
  BOARD_FORBIDDEN: 'Нет доступа к этой доске',
  BOARD_INVITE_CODE_GENERATION_FAILED: 'Не удалось сгенерировать новый код приглашения',
  BOARD_INVITE_CODE_INVALID: 'Введите корректный код приглашения',
  BOARD_INVITE_CODE_NOT_FOUND: 'Код приглашения не найден',
  BOARD_MEMBER_ALREADY_EXISTS: 'Вы уже состоите на этой доске',
  BOARD_NOT_FOUND: 'Доска не найдена',
  BOARD_OWNER_ALREADY_INCLUDED: 'Владелец уже состоит в этой доске',
  EMAIL_ALREADY_VERIFIED: 'Этот email уже подтвержден',
  EMAIL_DELIVERY_FAILED: 'Не удалось отправить письмо подтверждения',
  EMAIL_NOT_VERIFIED: 'Сначала подтвердите email, чтобы войти',
  EMAIL_VERIFICATION_TOKEN_EXPIRED: 'Ссылка подтверждения уже истекла',
  EMAIL_VERIFICATION_TOKEN_INVALID: 'Ссылка подтверждения недействительна',
  FORBIDDEN: 'Недостаточно прав',
  INTERNAL_SERVER_ERROR: 'Внутренняя ошибка сервера',
  INVALID_CREDENTIALS: 'Неверный email или пароль',
  NOT_FOUND: 'Ничего не найдено',
  REQUEST_FAILED: 'Не удалось выполнить запрос',
  TASK_ARCHIVED: 'Задача находится в архиве',
  TASK_FORBIDDEN: 'Нет доступа к этой задаче',
  TASK_NOT_FOUND: 'Задача не найдена',
  UNAUTHORIZED: 'Нужна авторизация',
  USER_ALREADY_EXISTS: 'Пользователь с таким email уже существует',
  VALIDATION_ERROR: 'Данные не прошли проверку'
}

function translateApiError(code: string) {
  return apiErrorMessages[code] ?? 'Не удалось выполнить запрос'
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

type RequestOptions<TResponse, TBody> = {
  body?: TBody
  schema?: {
    parse(input: unknown): TResponse
  }
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
}

export async function apiRequest<TResponse, TBody = unknown>(
  path: string,
  options: RequestOptions<TResponse, TBody> = {}
): Promise<TResponse> {
  const method = options.method ?? 'GET'
  const requestUrl = `${getWebEnv().apiUrl}${path}`

  logger.debug('Sending API request', {
    method,
    path,
    hasBody: Boolean(options.body)
  })

  const response = await fetch(requestUrl, {
    method,
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  logger.info('Received API response', {
    method,
    path,
    status: response.status
  })

  if (response.status === 204) {
    return undefined as TResponse
  }

  const payload =
    response.headers.get('content-length') === '0' || response.headers.get('content-type')?.includes('application/json') === false
      ? null
      : ((await response.json()) as unknown)

  if (!response.ok) {
    const parsedError = authErrorResponseSchema.safeParse(payload)
    const code = parsedError.success ? parsedError.data.error : 'REQUEST_FAILED'

    logger.warn('API request failed', {
      method,
      path,
      status: response.status,
      code
    })

    throw new ApiClientError(
      translateApiError(code),
      response.status,
      code,
      parsedError.success ? parsedError.data.details : undefined
    )
  }

  if (!options.schema) {
    return payload as TResponse
  }

  const parsedPayload = options.schema.parse(payload)

  logger.debug('Validated API response payload', {
    method,
    path
  })

  return parsedPayload as TResponse
}
