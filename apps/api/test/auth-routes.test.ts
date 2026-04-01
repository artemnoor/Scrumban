import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../src/shared/config/env';
import { registerErrorHandler } from '../src/shared/http/error-handler';
import type {
  AuthRepository,
  EmailVerificationTokenRecord,
  SessionRecord,
  UserRecord
} from '../src/modules/auth/repositories/auth-repository';
import { buildAuthModule } from '../src/modules/auth';
import type { AuthMailer, SendVerificationEmailInput } from '../src/modules/auth/mail/auth-mailer';

class InMemoryAuthRepository implements AuthRepository {
  private users = new Map<string, UserRecord>();
  private sessions = new Map<string, SessionRecord>();
  private verificationTokens = new Map<string, EmailVerificationTokenRecord>();

  async createUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    role?: 'user' | 'admin';
    emailVerificationStatus?: 'pending' | 'verified';
    emailVerifiedAt?: Date | null;
  }) {
    const user: UserRecord = {
      id: `user-${this.users.size + 1}`,
      email: input.email,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      role: input.role ?? 'user',
      emailVerificationStatus: input.emailVerificationStatus ?? 'verified',
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.users.set(user.id, user);
    return user;
  }

  async updateUnverifiedUserRegistration(input: {
    userId: string;
    displayName: string;
    passwordHash: string;
  }) {
    const user = this.users.get(input.userId);

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    const nextUser: UserRecord = {
      ...user,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      updatedAt: new Date()
    };

    this.users.set(nextUser.id, nextUser);
    return nextUser;
  }

  async findUserByEmail(email: string) {
    return Array.from(this.users.values()).find((user) => user.email === email) ?? null;
  }

  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }

  async markUserEmailVerified(userId: string, verifiedAt: Date) {
    const user = this.users.get(userId);

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    const nextUser: UserRecord = {
      ...user,
      emailVerificationStatus: 'verified',
      emailVerifiedAt: verifiedAt,
      updatedAt: new Date()
    };

    this.users.set(userId, nextUser);
    return nextUser;
  }

  async createSession(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    const user = this.users.get(input.userId);

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    const session: SessionRecord = {
      id: `session-${this.sessions.size + 1}`,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      user
    };

    this.sessions.set(input.tokenHash, session);
    return session;
  }

  async findSessionByTokenHash(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }

  async deleteSessionByTokenHash(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  async createEmailVerificationToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    const user = this.users.get(input.userId);

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    const token: EmailVerificationTokenRecord = {
      id: `verification-${this.verificationTokens.size + 1}`,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      user
    };

    this.verificationTokens.set(input.tokenHash, token);
    return token;
  }

  async findEmailVerificationTokenByTokenHash(tokenHash: string) {
    return this.verificationTokens.get(tokenHash) ?? null;
  }

  async deleteEmailVerificationTokensByUserId(userId: string) {
    for (const [tokenHash, token] of this.verificationTokens.entries()) {
      if (token.user.id === userId) {
        this.verificationTokens.delete(tokenHash);
      }
    }
  }

  async consumeEmailVerificationTokenByTokenHash(tokenHash: string, consumedAt: Date) {
    const token = this.verificationTokens.get(tokenHash);

    if (!token) {
      return;
    }

    this.verificationTokens.set(tokenHash, {
      ...token,
      consumedAt
    });
  }
}

class InMemoryAuthMailer implements AuthMailer {
  readonly sentMessages: SendVerificationEmailInput[] = [];

  async sendVerificationEmail(input: SendVerificationEmailInput) {
    this.sentMessages.push(input);
  }
}

const testEnv: ApiEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'debug',
  API_PORT: 4000,
  DEPLOYMENT_TARGET: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  TRUST_PROXY: false,
  SESSION_COOKIE_NAME: 'scrumbun_session',
  SESSION_COOKIE_SECRET: 'replace-me-with-a-long-random-secret',
  SESSION_COOKIE_DOMAIN: undefined,
  SESSION_COOKIE_SAME_SITE: 'lax',
  SESSION_COOKIE_SECURE: false,
  SMTP_HOST: 'localhost',
  SMTP_PORT: 1025,
  SMTP_SECURE: false,
  SMTP_USER: undefined,
  SMTP_PASS: undefined,
  SMTP_FROM_EMAIL: 'noreply@scrumbun.local',
  SMTP_FROM_NAME: 'Scrumbun',
  DATABASE_APPLY_STRATEGY: 'none',
  DATABASE_SSL_MODE: 'disable',
  DATABASE_SSL_ROOT_CERT_PATH: undefined
};

describe('auth routes', () => {
  it('supports register -> verify -> login -> me -> logout flow', async () => {
    const app = Fastify({
      logger: false
    });
    const repository = new InMemoryAuthRepository();
    const mailer = new InMemoryAuthMailer();

    await app.register(cookie, {
      secret: testEnv.SESSION_COOKIE_SECRET
    });
    registerErrorHandler(app);
    await app.register(buildAuthModule({ env: testEnv, repository, mailer }), {
      prefix: '/auth'
    });

    const registerResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'route@example.com',
        password: 'supersecret123',
        displayName: 'Route User'
      }
    });

    expect(registerResponse.statusCode).toBe(202);
    expect(mailer.sentMessages).toHaveLength(1);

    const token = new URL(mailer.sentMessages[0]?.verificationUrl ?? '').searchParams.get('token');
    expect(token).toBeTruthy();

    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: {
        token
      }
    });

    expect(verifyResponse.statusCode).toBe(200);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'route@example.com',
        password: 'supersecret123'
      }
    });

    expect(loginResponse.statusCode).toBe(200);

    const cookieHeader = loginResponse.cookies[0];
    expect(cookieHeader.name).toBe(testEnv.SESSION_COOKIE_NAME);

    const meResponse = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: {
        [cookieHeader.name]: cookieHeader.value
      }
    });

    expect(meResponse.statusCode).toBe(200);

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: {
        [cookieHeader.name]: cookieHeader.value
      }
    });

    expect(logoutResponse.statusCode).toBe(204);
  });

  it('rejects login before email verification and supports resend', async () => {
    const app = Fastify({
      logger: false
    });
    const repository = new InMemoryAuthRepository();
    const mailer = new InMemoryAuthMailer();

    await app.register(cookie, {
      secret: testEnv.SESSION_COOKIE_SECRET
    });
    registerErrorHandler(app);
    await app.register(buildAuthModule({ env: testEnv, repository, mailer }), {
      prefix: '/auth'
    });

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'pending@example.com',
        password: 'supersecret123',
        displayName: 'Pending User'
      }
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'pending@example.com',
        password: 'supersecret123'
      }
    });

    expect(loginResponse.statusCode).toBe(403);
    expect(loginResponse.json()).toMatchObject({
      error: 'EMAIL_NOT_VERIFIED',
      details: {
        email: 'pending@example.com'
      }
    });

    const resendResponse = await app.inject({
      method: 'POST',
      url: '/auth/resend-verification',
      payload: {
        email: 'pending@example.com'
      }
    });

    expect(resendResponse.statusCode).toBe(202);
    expect(mailer.sentMessages).toHaveLength(2);
  });
});
