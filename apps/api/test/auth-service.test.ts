import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '../src/shared/config/env';
import type {
  AuthRepository,
  EmailVerificationTokenRecord,
  SessionRecord,
  UserRecord
} from '../src/modules/auth/repositories/auth-repository';
import { AuthService } from '../src/modules/auth/services/auth-service';
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

describe('AuthService', () => {
  it('registers a new user in pending-verification mode and sends email', async () => {
    const repository = new InMemoryAuthRepository();
    const mailer = new InMemoryAuthMailer();
    const service = new AuthService(repository, testEnv, mailer);

    const result = await service.register({
      email: 'alice@example.com',
      password: 'supersecret123',
      displayName: 'Alice'
    });

    expect(result.email).toBe('alice@example.com');
    expect(result.resent).toBe(false);
    expect(mailer.sentMessages).toHaveLength(1);
    expect(mailer.sentMessages[0]?.verificationUrl).toContain('/verify-email?token=');
  });

  it('rejects login before email verification', async () => {
    const repository = new InMemoryAuthRepository();
    const mailer = new InMemoryAuthMailer();
    const service = new AuthService(repository, testEnv, mailer);

    await service.register({
      email: 'bob@example.com',
      password: 'supersecret123',
      displayName: 'Bob'
    });

    await expect(
      service.login({
        email: 'bob@example.com',
        password: 'supersecret123'
      })
    ).rejects.toThrow('EMAIL_NOT_VERIFIED');
  });

  it('verifies email and then allows login', async () => {
    const repository = new InMemoryAuthRepository();
    const mailer = new InMemoryAuthMailer();
    const service = new AuthService(repository, testEnv, mailer);

    await service.register({
      email: 'carol@example.com',
      password: 'supersecret123',
      displayName: 'Carol'
    });

    const sent = mailer.sentMessages.at(-1);
    const verificationUrl = new URL(sent?.verificationUrl ?? '');
    const token = verificationUrl.searchParams.get('token');

    expect(token).toBeTruthy();

    const verificationResult = await service.verifyEmail(token ?? '');
    expect(verificationResult.email).toBe('carol@example.com');

    const session = await service.login({
      email: 'carol@example.com',
      password: 'supersecret123'
    });

    expect(session.user.emailVerificationStatus).toBe('verified');
    expect(session.rawToken.length).toBeGreaterThan(10);
  });

  it('resends verification email for pending user', async () => {
    const repository = new InMemoryAuthRepository();
    const mailer = new InMemoryAuthMailer();
    const service = new AuthService(repository, testEnv, mailer);

    await service.register({
      email: 'dina@example.com',
      password: 'supersecret123',
      displayName: 'Dina'
    });

    const resent = await service.resendVerification('dina@example.com');

    expect(resent.resent).toBe(true);
    expect(mailer.sentMessages).toHaveLength(2);
  });
});
