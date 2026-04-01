import { z } from 'zod';

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('debug'),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DEPLOYMENT_TARGET: z.string().default('local'),
  TRUST_PROXY: z.coerce.boolean().default(false),
  SESSION_COOKIE_NAME: z.string().min(1).default('scrumbun_session'),
  SESSION_COOKIE_SECRET: z.string().min(16).default('replace-me-with-a-long-random-secret'),
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  SESSION_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  SESSION_COOKIE_SECURE: z.coerce.boolean().optional(),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().email().default('noreply@scrumbun.local'),
  SMTP_FROM_NAME: z.string().min(1).default('Scrumbun'),
  DATABASE_APPLY_STRATEGY: z.enum(['push', 'migrate-deploy', 'none']).default('push'),
  DATABASE_SSL_MODE: z.enum(['disable', 'require', 'verify-ca', 'verify-full']).default('disable'),
  DATABASE_SSL_ROOT_CERT_PATH: z.string().optional()
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function getApiEnv(overrides: Partial<Record<keyof ApiEnv, unknown>> = {}): ApiEnv {
  const rawEnv = apiEnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    API_PORT: process.env.API_PORT,
    WEB_ORIGIN: process.env.WEB_ORIGIN,
    DEPLOYMENT_TARGET: process.env.DEPLOYMENT_TARGET,
    TRUST_PROXY: process.env.TRUST_PROXY,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
    SESSION_COOKIE_SECRET: process.env.SESSION_COOKIE_SECRET,
    SESSION_COOKIE_DOMAIN: process.env.SESSION_COOKIE_DOMAIN,
    SESSION_COOKIE_SAME_SITE: process.env.SESSION_COOKIE_SAME_SITE,
    SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL,
    SMTP_FROM_NAME: process.env.SMTP_FROM_NAME,
    DATABASE_APPLY_STRATEGY: process.env.DATABASE_APPLY_STRATEGY,
    DATABASE_SSL_MODE: process.env.DATABASE_SSL_MODE,
    DATABASE_SSL_ROOT_CERT_PATH: process.env.DATABASE_SSL_ROOT_CERT_PATH,
    ...overrides
  });

  return {
    ...rawEnv,
    SESSION_COOKIE_SECURE:
      rawEnv.SESSION_COOKIE_SECURE ?? rawEnv.NODE_ENV === 'production'
  };
}
