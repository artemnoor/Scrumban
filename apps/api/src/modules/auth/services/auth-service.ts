import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createLogger } from '@scrumbun/config';
import {
  registerResponseSchema,
  userSchema,
  verifyEmailResponseSchema,
  type LoginInput,
  type RegisterInput,
  type RegisterResponseDto,
  type VerifyEmailResponseDto
} from '@scrumbun/shared/auth';
import type { ApiEnv } from '../../../shared/config/env';
import type {
  AuthRepository,
  SessionRecord,
  UserRecord
} from '../repositories/auth-repository';
import type { AuthMailer } from '../mail/auth-mailer';

const logger = createLogger('apps/api/auth-service');
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 30;

type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  emailVerificationStatus: 'pending' | 'verified';
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AuthSessionResult = {
  rawToken: string;
  sessionId: string;
  user: AuthenticatedUser;
  expiresAt: string;
};

type AuthServiceErrorCode =
  | 'USER_ALREADY_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'EMAIL_ALREADY_VERIFIED'
  | 'EMAIL_VERIFICATION_TOKEN_INVALID'
  | 'EMAIL_VERIFICATION_TOKEN_EXPIRED'
  | 'EMAIL_DELIVERY_FAILED'
  | 'NOT_FOUND';

class AuthServiceError extends Error {
  constructor(
    message: AuthServiceErrorCode,
    readonly statusCode: 400 | 401 | 403 | 404 | 409 | 502,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function createRawToken() {
  return randomBytes(32).toString('hex');
}

function mapAuthenticatedUser(user: UserRecord): AuthenticatedUser {
  return userSchema.parse({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerificationStatus: user.emailVerificationStatus,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  });
}

function mapSessionResult(session: SessionRecord, rawToken: string): AuthSessionResult {
  return {
    rawToken,
    sessionId: session.id,
    user: mapAuthenticatedUser(session.user),
    expiresAt: session.expiresAt.toISOString()
  };
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly env: ApiEnv,
    private readonly mailer: AuthMailer
  ) {}

  async register(input: RegisterInput): Promise<RegisterResponseDto> {
    logger.debug('Register flow started', {
      email: input.email
    });

    const existingUser = await this.repository.findUserByEmail(input.email);
    const passwordHash = await bcrypt.hash(input.password, 10);

    if (existingUser?.emailVerificationStatus === 'verified') {
      logger.warn('Register rejected because verified user already exists', {
        email: input.email
      });
      throw new AuthServiceError('USER_ALREADY_EXISTS', 409);
    }

    const user = existingUser
      ? await this.repository.updateUnverifiedUserRegistration({
          userId: existingUser.id,
          displayName: input.displayName,
          passwordHash
        })
      : await this.repository.createUser({
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          emailVerificationStatus: 'pending'
        });

    const response = await this.issueVerificationForUser(user, Boolean(existingUser));

    logger.info('Register flow completed in pending-verification mode', {
      userId: user.id,
      resent: response.resent
    });

    return response;
  }

  async login(input: LoginInput): Promise<AuthSessionResult> {
    logger.debug('Login flow started', {
      email: input.email
    });

    const user = await this.repository.findUserByEmail(input.email);

    if (!user) {
      logger.warn('Login rejected because user was not found', {
        email: input.email
      });
      throw new AuthServiceError('INVALID_CREDENTIALS', 401);
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);

    if (!isValidPassword) {
      logger.warn('Login rejected because password did not match', {
        userId: user.id
      });
      throw new AuthServiceError('INVALID_CREDENTIALS', 401);
    }

    if (user.emailVerificationStatus !== 'verified') {
      logger.warn('Login rejected because email is not verified', {
        userId: user.id,
        email: user.email
      });
      throw new AuthServiceError('EMAIL_NOT_VERIFIED', 403, {
        email: user.email
      });
    }

    logger.info('Login accepted', {
      userId: user.id
    });

    return this.createSessionForUser(user);
  }

  async resendVerification(email: string) {
    logger.debug('Resend verification requested', {
      email
    });

    const user = await this.repository.findUserByEmail(email);

    if (!user) {
      logger.warn('Resend verification rejected because user was not found', {
        email
      });
      throw new AuthServiceError('NOT_FOUND', 404);
    }

    if (user.emailVerificationStatus === 'verified') {
      logger.warn('Resend verification rejected because user is already verified', {
        userId: user.id
      });
      throw new AuthServiceError('EMAIL_ALREADY_VERIFIED', 409, {
        email: user.email
      });
    }

    return this.issueVerificationForUser(user, true);
  }

  async verifyEmail(token: string): Promise<VerifyEmailResponseDto> {
    logger.debug('Verify email flow started');

    const tokenHash = hashToken(token);
    const verificationToken = await this.repository.findEmailVerificationTokenByTokenHash(tokenHash);

    if (!verificationToken || verificationToken.consumedAt) {
      logger.warn('Verify email rejected because token was not found or already consumed');
      throw new AuthServiceError('EMAIL_VERIFICATION_TOKEN_INVALID', 400);
    }

    if (verificationToken.expiresAt.getTime() <= Date.now()) {
      logger.warn('Verify email rejected because token expired', {
        tokenId: verificationToken.id,
        userId: verificationToken.user.id
      });
      await this.repository.deleteEmailVerificationTokensByUserId(verificationToken.user.id);
      throw new AuthServiceError('EMAIL_VERIFICATION_TOKEN_EXPIRED', 400);
    }

    const verifiedAt = new Date();
    await this.repository.consumeEmailVerificationTokenByTokenHash(tokenHash, verifiedAt);
    const user = await this.repository.markUserEmailVerified(verificationToken.user.id, verifiedAt);
    await this.repository.deleteEmailVerificationTokensByUserId(user.id);

    logger.info('Email verified successfully', {
      userId: user.id
    });

    return verifyEmailResponseSchema.parse({
      email: user.email,
      verifiedAt: verifiedAt.toISOString()
    });
  }

  async resolveSession(rawToken: string | null): Promise<AuthSessionResult | null> {
    logger.debug('Resolving session', {
      hasToken: Boolean(rawToken)
    });

    if (!rawToken) {
      return null;
    }

    const session = await this.repository.findSessionByTokenHash(hashToken(rawToken));

    if (!session) {
      logger.warn('Session not found for provided token hash');
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      logger.warn('Session expired and will be removed', {
        sessionId: session.id
      });
      await this.repository.deleteSessionByTokenHash(session.tokenHash);
      return null;
    }

    if (session.user.emailVerificationStatus !== 'verified') {
      logger.warn('Session rejected because user email is not verified', {
        sessionId: session.id,
        userId: session.user.id
      });
      await this.repository.deleteSessionByTokenHash(session.tokenHash);
      return null;
    }

    logger.info('Session resolved successfully', {
      sessionId: session.id,
      userId: session.user.id
    });

    return mapSessionResult(session, rawToken);
  }

  async logout(rawToken: string | null) {
    logger.debug('Logout flow started', {
      hasToken: Boolean(rawToken)
    });

    if (!rawToken) {
      return;
    }

    await this.repository.deleteSessionByTokenHash(hashToken(rawToken));
    logger.info('Session removed successfully');
  }

  private async createSessionForUser(user: UserRecord): Promise<AuthSessionResult> {
    const rawToken = createRawToken();
    const session = await this.repository.createSession({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
    });

    logger.info('Session created successfully', {
      sessionId: session.id,
      userId: user.id
    });

    return mapSessionResult(session, rawToken);
  }

  private async issueVerificationForUser(user: UserRecord, resent: boolean) {
    const rawToken = createRawToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS);
    const verificationUrl = `${this.env.WEB_ORIGIN}/verify-email?token=${encodeURIComponent(rawToken)}`;

    await this.repository.deleteEmailVerificationTokensByUserId(user.id);
    await this.repository.createEmailVerificationToken({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt
    });

    try {
      await this.mailer.sendVerificationEmail({
        email: user.email,
        displayName: user.displayName,
        verificationUrl,
        expiresAt
      });
    } catch (error) {
      logger.error('Verification email delivery failed', {
        userId: user.id,
        email: user.email,
        message: error instanceof Error ? error.message : 'Unknown mailer error'
      });
      throw new AuthServiceError('EMAIL_DELIVERY_FAILED', 502, {
        email: user.email
      });
    }

    return registerResponseSchema.parse({
      email: user.email,
      verificationExpiresAt: expiresAt.toISOString(),
      resent
    });
  }
}

export { AuthServiceError };
