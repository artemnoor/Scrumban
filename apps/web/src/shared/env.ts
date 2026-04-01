type WebEnv = {
  apiUrl: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
};

function normalizeLogLevel(input?: string): WebEnv['logLevel'] {
  switch ((input ?? '').toLowerCase()) {
    case 'info':
      return 'info';
    case 'warn':
      return 'warn';
    case 'error':
      return 'error';
    default:
      return 'debug';
  }
}

export function getWebEnv(): WebEnv {
  return {
    apiUrl: import.meta.env.VITE_API_URL ?? '/api',
    logLevel: normalizeLogLevel(import.meta.env.VITE_LOG_LEVEL)
  };
}
