export type RuntimeEnvironment = 'development' | 'test' | 'production';

export type RuntimeConfig = {
  environment: RuntimeEnvironment;
  logLevel: string;
};

export function getRuntimeConfig(): RuntimeConfig {
  const environment = (process.env.NODE_ENV ?? 'development') as RuntimeEnvironment;

  return {
    environment,
    logLevel: process.env.LOG_LEVEL ?? 'debug'
  };
}
