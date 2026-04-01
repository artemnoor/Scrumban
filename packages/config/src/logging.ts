export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const orderedLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function normalizeLogLevel(input?: string): LogLevel {
  const candidate = (input ?? '').trim().toLowerCase() as LogLevel;

  if (orderedLevels.includes(candidate)) {
    return candidate;
  }

  return 'debug';
}

function shouldLog(configuredLevel: LogLevel, messageLevel: LogLevel): boolean {
  return orderedLevels.indexOf(messageLevel) >= orderedLevels.indexOf(configuredLevel);
}

export function getLogLevel(): LogLevel {
  return normalizeLogLevel(process.env.LOG_LEVEL);
}

export function createLogger(scope: string) {
  const configuredLevel = getLogLevel();

  function emit(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (!shouldLog(configuredLevel, level)) {
      return;
    }

    const payload = context ? ` ${JSON.stringify(context)}` : '';
    const line = `[${scope}] ${level.toUpperCase()} ${message}${payload}`;

    switch (level) {
      case 'debug':
      case 'info':
        console.log(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'error':
        console.error(line);
        break;
    }
  }

  return {
    debug(message: string, context?: Record<string, unknown>) {
      emit('debug', message, context);
    },
    info(message: string, context?: Record<string, unknown>) {
      emit('info', message, context);
    },
    warn(message: string, context?: Record<string, unknown>) {
      emit('warn', message, context);
    },
    error(message: string, context?: Record<string, unknown>) {
      emit('error', message, context);
    }
  };
}
