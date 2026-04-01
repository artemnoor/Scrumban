import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import type { AdminRepository } from '../src/modules/admin/repositories/admin-repository';
import { buildAdminModule } from '../src/modules/admin';
import { buildAuthModule } from '../src/modules/auth';
import { registerErrorHandler } from '../src/shared/http/error-handler';
import type {
  AuthRepository,
  EmailVerificationTokenRecord,
  SessionRecord,
  UserRecord
} from '../src/modules/auth/repositories/auth-repository';
import type { ApiEnv } from '../src/shared/config/env';
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

  async findUserByEmail(email: string) {
    return Array.from(this.users.values()).find((user) => user.email === email) ?? null;
  }

  async findUserById(id: string) {
    return this.users.get(id) ?? null;
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

class StubAdminRepository implements AdminRepository {
  async getOverview() {
    return {
      counts: {
        activeBoards: 1,
        archivedBoards: 0,
        activeTasks: 1,
        archivedTasks: 0,
        users: 2,
        admins: 1
      },
      archivedBoards: [],
      archivedTasks: [],
      users: [
        {
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin',
          role: 'admin' as const,
          emailVerificationStatus: 'verified' as const,
          emailVerifiedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    };
  }

  async setBoardArchived(
    _boardId: string,
    _archived: boolean,
    _actorId: string
  ): Promise<import('../src/modules/boards/repositories/boards-repository').BoardRecord> {
    throw new Error('Not needed in this test');
  }

  async setTaskArchived(
    _taskId: string,
    _archived: boolean,
    _actorId: string
  ): Promise<import('../src/modules/tasks/repositories/tasks-repository').TaskRecord> {
    throw new Error('Not needed in this test');
  }

  async setTaskAssignment(
    _taskId: string,
    _assigneeId: string | null
  ): Promise<import('../src/modules/tasks/repositories/tasks-repository').TaskRecord> {
    throw new Error('Not needed in this test');
  }

  async setTaskColumn(
    _taskId: string,
    _columnId: string
  ): Promise<import('../src/modules/tasks/repositories/tasks-repository').TaskRecord> {
    throw new Error('Not needed in this test');
  }

  async deleteBoard(_boardId: string): Promise<void> {
    throw new Error('Not needed in this test');
  }

  async deleteTask(_taskId: string): Promise<void> {
    throw new Error('Not needed in this test');
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

describe('admin routes', () => {
  it('allows admins and rejects regular users', async () => {
    const app = Fastify({
      logger: false
    });
    const authRepository = new InMemoryAuthRepository();
    const mailer = new InMemoryAuthMailer();

    await authRepository.createUser({
      email: 'admin@example.com',
      displayName: 'Admin',
      passwordHash: await bcrypt.hash('supersecret123', 10),
      role: 'admin',
      emailVerificationStatus: 'verified',
      emailVerifiedAt: new Date()
    });

    await authRepository.createUser({
      email: 'user@example.com',
      displayName: 'Regular User',
      passwordHash: await bcrypt.hash('supersecret123', 10),
      role: 'user',
      emailVerificationStatus: 'verified',
      emailVerifiedAt: new Date()
    });

    await app.register(cookie, {
      secret: testEnv.SESSION_COOKIE_SECRET
    });
    registerErrorHandler(app);
    await app.register(buildAuthModule({ env: testEnv, repository: authRepository, mailer }), {
      prefix: '/auth'
    });
    await app.register(
      buildAdminModule({
        env: testEnv,
        authRepository,
        repository: new StubAdminRepository()
      }),
      {
        prefix: '/admin'
      }
    );

    const userLoginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'user@example.com',
        password: 'supersecret123'
      }
    });

    const adminLoginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'admin@example.com',
        password: 'supersecret123'
      }
    });

    const userCookie = userLoginResponse.cookies[0];
    const adminCookie = adminLoginResponse.cookies[0];

    const forbiddenResponse = await app.inject({
      method: 'GET',
      url: '/admin/overview',
      cookies: {
        [userCookie.name]: userCookie.value
      }
    });

    expect(forbiddenResponse.statusCode).toBe(403);

    const allowedResponse = await app.inject({
      method: 'GET',
      url: '/admin/overview',
      cookies: {
        [adminCookie.name]: adminCookie.value
      }
    });

    expect(allowedResponse.statusCode).toBe(200);
  });
});
