import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { buildAuthModule } from '../src/modules/auth';
import { buildBoardsModule } from '../src/modules/boards';
import { registerErrorHandler } from '../src/shared/http/error-handler';
import type {
  AuthRepository,
  EmailVerificationTokenRecord,
  SessionRecord,
  UserRecord
} from '../src/modules/auth/repositories/auth-repository';
import type {
  BoardRecord,
  BoardsRepository
} from '../src/modules/boards/repositories/boards-repository';
import type {
  UserSummaryRecord,
  UsersRepository
} from '../src/modules/users/repositories/users-repository';
import type { ApiEnv } from '../src/shared/config/env';
import type { AuthMailer, SendVerificationEmailInput } from '../src/modules/auth/mail/auth-mailer';

class InMemoryUserDirectory {
  private readonly users = new Map<string, UserRecord>();

  create(input: {
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

  findByEmail(email: string) {
    return Array.from(this.users.values()).find((user) => user.email === email) ?? null;
  }

  findById(id: string) {
    return this.users.get(id) ?? null;
  }

  update(userId: string, patch: Partial<UserRecord>) {
    const user = this.users.get(userId);

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    const nextUser: UserRecord = {
      ...user,
      ...patch,
      updatedAt: new Date()
    };

    this.users.set(userId, nextUser);
    return nextUser;
  }

  listSummary(): UserSummaryRecord[] {
    return Array.from(this.users.values()).map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerificationStatus: user.emailVerificationStatus,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));
  }
}

class InMemoryAuthRepository implements AuthRepository {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly verificationTokens = new Map<string, EmailVerificationTokenRecord>();

  constructor(private readonly directory: InMemoryUserDirectory) {}

  async createUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    role?: 'user' | 'admin';
    emailVerificationStatus?: 'pending' | 'verified';
    emailVerifiedAt?: Date | null;
  }) {
    return this.directory.create(input);
  }

  async findUserByEmail(email: string) {
    return this.directory.findByEmail(email);
  }

  async findUserById(id: string) {
    return this.directory.findById(id);
  }

  async updateUnverifiedUserRegistration(input: {
    userId: string;
    displayName: string;
    passwordHash: string;
  }) {
    return this.directory.update(input.userId, {
      displayName: input.displayName,
      passwordHash: input.passwordHash
    });
  }

  async markUserEmailVerified(userId: string, verifiedAt: Date) {
    return this.directory.update(userId, {
      emailVerificationStatus: 'verified',
      emailVerifiedAt: verifiedAt
    });
  }

  async createSession(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    const user = this.directory.findById(input.userId);

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
    const user = this.directory.findById(input.userId);

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

class InMemoryUsersRepository implements UsersRepository {
  constructor(private readonly directory: InMemoryUserDirectory) {}

  async listUsers() {
    return this.directory.listSummary();
  }

  async findUserById(id: string) {
    return this.directory
      .listSummary()
      .find((user) => user.id === id) ?? null;
  }
}

class InMemoryBoardsRepository implements BoardsRepository {
  private readonly boards = new Map<string, BoardRecord>();
  private boardSequence = 1;
  private columnSequence = 1;

  constructor(private readonly directory: InMemoryUserDirectory) {}

  async listBoards(input: { actorId: string; includeArchived: boolean; includeAll: boolean }) {
    return Array.from(this.boards.values()).filter((board) => {
      const hasAccess =
        input.includeAll ||
        board.ownerId === input.actorId ||
        board.members.some((member) => member.userId === input.actorId);

      return hasAccess && (input.includeArchived || board.archivedAt === null);
    });
  }

  async findBoardById(boardId: string) {
    return this.boards.get(boardId) ?? null;
  }

  async findBoardByInviteCode(inviteCode: string) {
    return Array.from(this.boards.values()).find((board) => board.inviteCode === inviteCode) ?? null;
  }

  async createBoard(input: {
    name: string;
    slug: string;
    inviteCode: string;
    description?: string | null;
    ownerId: string;
    ownerColor: string;
    defaultColumns: Array<{ name: string; slug: string; color: string }>;
  }) {
    const boardId = `board-${this.boardSequence++}`;
    const now = new Date();
    const owner = this.requireUser(input.ownerId);
    const board: BoardRecord = {
      id: boardId,
      name: input.name,
      slug: input.slug,
      inviteCode: input.inviteCode,
      description: input.description ?? null,
      ownerId: input.ownerId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      members: [
        {
          boardId,
          userId: input.ownerId,
          color: input.ownerColor,
          createdAt: now,
          updatedAt: now,
          user: {
            id: owner.id,
            email: owner.email,
            displayName: owner.displayName,
            role: owner.role,
            emailVerificationStatus: owner.emailVerificationStatus,
            emailVerifiedAt: owner.emailVerifiedAt,
            createdAt: owner.createdAt,
            updatedAt: owner.updatedAt
          }
        }
      ],
      columns: input.defaultColumns.map((column, position) => ({
        id: `column-${this.columnSequence++}`,
        boardId,
        name: column.name,
        slug: column.slug,
        color: column.color,
        position,
        createdAt: now,
        updatedAt: now
      }))
    };

    this.boards.set(board.id, board);
    return board;
  }

  async updateBoard(
    boardId: string,
    input: {
      name?: string;
      slug?: string;
      description?: string | null;
    }
  ) {
    const board = this.requireBoard(boardId);
    const updated: BoardRecord = {
      ...board,
      name: input.name ?? board.name,
      slug: input.slug ?? board.slug,
      description: input.description === undefined ? board.description : input.description,
      updatedAt: new Date()
    };

    this.boards.set(boardId, updated);
    return updated;
  }

  async setBoardArchived(
    boardId: string,
    input: {
      archived: boolean;
      actorId: string;
    }
  ) {
    const board = this.requireBoard(boardId);
    const updated: BoardRecord = {
      ...board,
      archivedAt: input.archived ? new Date() : null,
      updatedAt: new Date()
    };

    this.boards.set(boardId, updated);
    return updated;
  }

  async addBoardMember(boardId: string, userId: string, color: string) {
    const board = this.requireBoard(boardId);
    const user = this.requireUser(userId);
    const now = new Date();
    const updated: BoardRecord = {
      ...board,
      members: [
        ...board.members,
        {
          boardId,
          userId,
          color,
          createdAt: now,
          updatedAt: now,
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            emailVerificationStatus: user.emailVerificationStatus,
            emailVerifiedAt: user.emailVerifiedAt,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          }
        }
      ],
      updatedAt: now
    };

    this.boards.set(boardId, updated);
    return updated;
  }

  async removeBoardMember(boardId: string, userId: string) {
    const board = this.requireBoard(boardId);
    const updated: BoardRecord = {
      ...board,
      members: board.members.filter((member) => member.userId !== userId),
      updatedAt: new Date()
    };

    this.boards.set(boardId, updated);
    return updated;
  }

  async updateBoardMemberColor(boardId: string, userId: string, color: string) {
    const board = this.requireBoard(boardId);
    const updated: BoardRecord = {
      ...board,
      members: board.members.map((member) =>
        member.userId === userId
          ? {
              ...member,
              color,
              updatedAt: new Date()
            }
          : member
      ),
      updatedAt: new Date()
    };

    this.boards.set(boardId, updated);
    return updated;
  }

  async updateBoardInviteCode(boardId: string, inviteCode: string) {
    const board = this.requireBoard(boardId);
    const updated: BoardRecord = {
      ...board,
      inviteCode,
      updatedAt: new Date()
    };

    this.boards.set(boardId, updated);
    return updated;
  }

  async createBoardColumn(
    boardId: string,
    input: {
      name: string;
      slug: string;
      color: string;
    }
  ) {
    const board = this.requireBoard(boardId);
    const now = new Date();
    const updated: BoardRecord = {
      ...board,
      columns: [
        ...board.columns,
        {
          id: `column-${this.columnSequence++}`,
          boardId,
          name: input.name,
          slug: input.slug,
          color: input.color,
          position: board.columns.length,
          createdAt: now,
          updatedAt: now
        }
      ],
      updatedAt: now
    };

    this.boards.set(boardId, updated);
    return updated;
  }

  async updateBoardColumn(
    boardId: string,
    columnId: string,
    input: {
      name?: string;
      slug?: string;
      color?: string;
    }
  ) {
    const board = this.requireBoard(boardId);
    const updated: BoardRecord = {
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              name: input.name ?? column.name,
              slug: input.slug ?? column.slug,
              color: input.color ?? column.color,
              updatedAt: new Date()
            }
          : column
      ),
      updatedAt: new Date()
    };

    this.boards.set(boardId, updated);
    return updated;
  }

  async reorderBoardColumns(boardId: string, columnIds: string[]) {
    const board = this.requireBoard(boardId);
    const reordered: BoardRecord = {
      ...board,
      columns: columnIds.map((columnId, position) => {
        const column = board.columns.find((item) => item.id === columnId);

        if (!column) {
          throw new Error('BOARD_COLUMN_NOT_FOUND');
        }

        return {
          ...column,
          position,
          updatedAt: new Date()
        };
      }),
      updatedAt: new Date()
    };

    this.boards.set(boardId, reordered);
    return reordered;
  }

  async deleteBoardColumn(boardId: string, columnId: string) {
    const board = this.requireBoard(boardId);
    const updated: BoardRecord = {
      ...board,
      columns: board.columns
        .filter((column) => column.id !== columnId)
        .map((column, position) => ({
          ...column,
          position
        })),
      updatedAt: new Date()
    };

    this.boards.set(boardId, updated);
    return updated;
  }

  async deleteBoard(boardId: string) {
    this.boards.delete(boardId);
  }

  private requireBoard(boardId: string) {
    const board = this.boards.get(boardId);

    if (!board) {
      throw new Error('BOARD_NOT_FOUND');
    }

    return board;
  }

  private requireUser(userId: string) {
    const user = this.directory.findById(userId);

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    return user;
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

describe('boards routes', () => {
  it('creates board, invites members, and keeps management rights with the owner', async () => {
    const app = Fastify({
      logger: false
    });
    const directory = new InMemoryUserDirectory();
    const authRepository = new InMemoryAuthRepository(directory);
    const mailer = new InMemoryAuthMailer();
    const boardsRepository = new InMemoryBoardsRepository(directory);
    const usersRepository = new InMemoryUsersRepository(directory);

    const ownerUser = await authRepository.createUser({
      email: 'owner@example.com',
      displayName: 'Owner User',
      passwordHash: await bcrypt.hash('supersecret123', 10),
      emailVerificationStatus: 'verified',
      emailVerifiedAt: new Date()
    });

    const memberUser = await authRepository.createUser({
      email: 'member@example.com',
      displayName: 'Member User',
      passwordHash: await bcrypt.hash('supersecret123', 10),
      emailVerificationStatus: 'verified',
      emailVerifiedAt: new Date()
    });

    await authRepository.createUser({
      email: 'outsider@example.com',
      displayName: 'Outsider User',
      passwordHash: await bcrypt.hash('supersecret123', 10),
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
      buildBoardsModule({
        env: testEnv,
        authRepository,
        repository: boardsRepository,
        usersRepository
      }),
      {
        prefix: '/boards'
      }
    );

    const ownerRegisterResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'owner@example.com',
        password: 'supersecret123'
      }
    });

    const memberRegisterResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'member@example.com',
        password: 'supersecret123'
      }
    });

    const outsiderRegisterResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'outsider@example.com',
        password: 'supersecret123'
      }
    });

    const ownerCookie = ownerRegisterResponse.cookies[0];
    const memberCookie = memberRegisterResponse.cookies[0];
    const outsiderCookie = outsiderRegisterResponse.cookies[0];

    const createdBoardResponse = await app.inject({
      method: 'POST',
      url: '/boards',
      cookies: {
        [ownerCookie.name]: ownerCookie.value
      },
      payload: {
        name: 'Platform Operations',
        slug: 'platform-ops',
        description: 'Board for platform delivery'
      }
    });

    expect(createdBoardResponse.statusCode).toBe(201);

    const createdBoard = createdBoardResponse.json();
    expect(createdBoard.name).toBe('Platform Operations');
    expect(createdBoard.inviteCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(createdBoard.members).toHaveLength(1);
    expect(createdBoard.columns.length).toBeGreaterThan(1);
    expect(createdBoard.members[0].color).toMatch(/^#[0-9A-F]{6}$/i);
    expect(createdBoard.columns[0].color).toMatch(/^#[0-9A-F]{6}$/i);

    const memberUserId = memberUser.id;
    const invitedBoardResponse = await app.inject({
      method: 'POST',
      url: `/boards/${createdBoard.id}/members`,
      cookies: {
        [ownerCookie.name]: ownerCookie.value
      },
      payload: {
        userId: memberUserId
      }
    });

    expect(invitedBoardResponse.statusCode).toBe(200);
    expect(
      invitedBoardResponse.json().members.some((member: { userId: string }) => member.userId === memberUserId)
    ).toBe(true);
    expect(
      invitedBoardResponse
        .json()
        .members.find((member: { userId: string; color: string }) => member.userId === memberUserId)?.color
    ).toMatch(/^#[0-9A-F]{6}$/i);

    const recolorMemberResponse = await app.inject({
      method: 'PATCH',
      url: `/boards/${createdBoard.id}/members/${memberUserId}`,
      cookies: {
        [ownerCookie.name]: ownerCookie.value
      },
      payload: {
        color: '#111111'
      }
    });

    expect(recolorMemberResponse.statusCode).toBe(200);
    expect(
      recolorMemberResponse
        .json()
        .members.find((member: { userId: string; color: string }) => member.userId === memberUserId)?.color
    ).toBe('#111111');

    const memberListResponse = await app.inject({
      method: 'GET',
      url: '/boards',
      cookies: {
        [memberCookie.name]: memberCookie.value
      }
    });

    expect(memberListResponse.statusCode).toBe(200);
    expect(memberListResponse.json()).toHaveLength(1);

    const memberBoardResponse = await app.inject({
      method: 'GET',
      url: `/boards/${createdBoard.id}`,
      cookies: {
        [memberCookie.name]: memberCookie.value
      }
    });

    expect(memberBoardResponse.statusCode).toBe(200);

    const outsiderBoardResponse = await app.inject({
      method: 'GET',
      url: `/boards/${createdBoard.id}`,
      cookies: {
        [outsiderCookie.name]: outsiderCookie.value
      }
    });

    expect(outsiderBoardResponse.statusCode).toBe(403);

    const joinedByCodeResponse = await app.inject({
      method: 'POST',
      url: '/boards/join',
      cookies: {
        [outsiderCookie.name]: outsiderCookie.value
      },
      payload: {
        inviteCode: createdBoard.inviteCode
      }
    });

    expect(joinedByCodeResponse.statusCode).toBe(200);

    const outsiderBoardsAfterJoin = await app.inject({
      method: 'GET',
      url: '/boards',
      cookies: {
        [outsiderCookie.name]: outsiderCookie.value
      }
    });

    expect(outsiderBoardsAfterJoin.statusCode).toBe(200);
    expect(outsiderBoardsAfterJoin.json()).toHaveLength(1);

    const regenerateInviteCodeResponse = await app.inject({
      method: 'POST',
      url: `/boards/${createdBoard.id}/invite-code/regenerate`,
      cookies: {
        [ownerCookie.name]: ownerCookie.value
      }
    });

    expect(regenerateInviteCodeResponse.statusCode).toBe(200);
    expect(regenerateInviteCodeResponse.json().inviteCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(regenerateInviteCodeResponse.json().inviteCode).not.toBe(createdBoard.inviteCode);

    const staleInviteCodeResponse = await app.inject({
      method: 'POST',
      url: '/boards/join',
      cookies: {
        [memberCookie.name]: memberCookie.value
      },
      payload: {
        inviteCode: createdBoard.inviteCode
      }
    });

    expect(staleInviteCodeResponse.statusCode).toBe(404);

    const ownerColumnResponse = await app.inject({
      method: 'POST',
      url: `/boards/${createdBoard.id}/columns`,
      cookies: {
        [ownerCookie.name]: ownerCookie.value
      },
      payload: {
        name: 'Blocked',
        color: '#222222'
      }
    });

    expect(ownerColumnResponse.statusCode).toBe(200);
    const blockedColumn = ownerColumnResponse
      .json()
      .columns.find((column: { name: string; color: string }) => column.name === 'Blocked');
    expect(blockedColumn).toBeTruthy();
    expect(blockedColumn.color).toBe('#222222');

    const memberManageResponse = await app.inject({
      method: 'PATCH',
      url: `/boards/${createdBoard.id}`,
      cookies: {
        [memberCookie.name]: memberCookie.value
      },
      payload: {
        description: 'Member should not be able to manage this'
      }
    });

    expect(memberManageResponse.statusCode).toBe(403);

    const reorderedColumnIds = ownerColumnResponse
      .json()
      .columns.map((column: { id: string }) => column.id)
      .reverse();

    const reorderResponse = await app.inject({
      method: 'POST',
      url: `/boards/${createdBoard.id}/columns/reorder`,
      cookies: {
        [ownerCookie.name]: ownerCookie.value
      },
      payload: {
        columnIds: reorderedColumnIds
      }
    });

    expect(reorderResponse.statusCode).toBe(200);
    expect(reorderResponse.json().columns[0].id).toBe(reorderedColumnIds[0]);

    const removedMemberResponse = await app.inject({
      method: 'DELETE',
      url: `/boards/${createdBoard.id}/members/${memberUserId}`,
      cookies: {
        [ownerCookie.name]: ownerCookie.value
      }
    });

    expect(removedMemberResponse.statusCode).toBe(200);
    expect(
      removedMemberResponse.json().members.some((member: { userId: string }) => member.userId === memberUserId)
    ).toBe(false);
  });
});
