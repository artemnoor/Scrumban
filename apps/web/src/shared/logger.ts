import { getWebEnv } from './env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const orderedLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function shouldLog(configuredLevel: LogLevel, messageLevel: LogLevel) {
  return orderedLevels.indexOf(messageLevel) >= orderedLevels.indexOf(configuredLevel);
}

export function createBrowserLogger(scope: string) {
  const configuredLevel = getWebEnv().logLevel;

  function emit(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (!shouldLog(configuredLevel, level)) {
      return;
    }

    const line = `[${scope}] ${level.toUpperCase()} ${message}`;

    switch (level) {
      case 'debug':
      case 'info':
        console.log(line, context ?? {});
        break;
      case 'warn':
        console.warn(line, context ?? {});
        break;
      case 'error':
        console.error(line, context ?? {});
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
