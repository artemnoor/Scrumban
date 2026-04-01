import { prisma } from '@scrumbun/db';

export type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  emailVerificationStatus: 'pending' | 'verified';
  emailVerifiedAt: Date | null;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionRecord = {
  id: string;
  tokenHash: string;
  expiresAt: Date;
  user: UserRecord;
};

export type EmailVerificationTokenRecord = {
  id: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  user: UserRecord;
};

export type AuthRepository = {
  createUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    role?: 'user' | 'admin';
    emailVerificationStatus?: 'pending' | 'verified';
    emailVerifiedAt?: Date | null;
  }): Promise<UserRecord>;
  updateUnverifiedUserRegistration(input: {
    userId: string;
    displayName: string;
    passwordHash: string;
  }): Promise<UserRecord>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  markUserEmailVerified(userId: string, verifiedAt: Date): Promise<UserRecord>;
  createSession(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<SessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
  createEmailVerificationToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<EmailVerificationTokenRecord>;
  findEmailVerificationTokenByTokenHash(tokenHash: string): Promise<EmailVerificationTokenRecord | null>;
  deleteEmailVerificationTokensByUserId(userId: string): Promise<void>;
  consumeEmailVerificationTokenByTokenHash(tokenHash: string, consumedAt: Date): Promise<void>;
};

function mapRole(role: 'USER' | 'ADMIN'): 'user' | 'admin' {
  return role === 'ADMIN' ? 'admin' : 'user';
}

function mapEmailVerificationStatus(status: 'PENDING' | 'VERIFIED'): 'pending' | 'verified' {
  return status === 'PENDING' ? 'pending' : 'verified';
}

function mapUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: 'USER' | 'ADMIN';
  emailVerificationStatus: 'PENDING' | 'VERIFIED';
  emailVerifiedAt: Date | null;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}): UserRecord {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: mapRole(user.role),
    emailVerificationStatus: mapEmailVerificationStatus(user.emailVerificationStatus),
    emailVerifiedAt: user.emailVerifiedAt,
    passwordHash: user.passwordHash,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export class PrismaAuthRepository implements AuthRepository {
  async createUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    role?: 'user' | 'admin';
    emailVerificationStatus?: 'pending' | 'verified';
    emailVerifiedAt?: Date | null;
  }) {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        role: input.role === 'admin' ? 'ADMIN' : 'USER',
        emailVerificationStatus:
          input.emailVerificationStatus === 'pending' ? 'PENDING' : 'VERIFIED',
        emailVerifiedAt: input.emailVerifiedAt ?? null
      }
    });

    return mapUser(user);
  }

  async updateUnverifiedUserRegistration(input: {
    userId: string;
    displayName: string;
    passwordHash: string;
  }) {
    const user = await prisma.user.update({
      where: {
        id: input.userId
      },
      data: {
        displayName: input.displayName,
        passwordHash: input.passwordHash
      }
    });

    return mapUser(user);
  }

  async findUserByEmail(email: string) {
    const user = await prisma.user.findUnique({
      where: {
        email
      }
    });

    return user ? mapUser(user) : null;
  }

  async findUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: {
        id
      }
    });

    return user ? mapUser(user) : null;
  }

  async markUserEmailVerified(userId: string, verifiedAt: Date) {
    const user = await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        emailVerificationStatus: 'VERIFIED',
        emailVerifiedAt: verifiedAt
      }
    });

    return mapUser(user);
  }

  async createSession(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    const session = await prisma.session.create({
      data: input,
      include: {
        user: true
      }
    });

    return {
      id: session.id,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
      user: mapUser(session.user)
    };
  }

  async findSessionByTokenHash(tokenHash: string) {
    const session = await prisma.session.findUnique({
      where: {
        tokenHash
      },
      include: {
        user: true
      }
    });

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
      user: mapUser(session.user)
    };
  }

  async deleteSessionByTokenHash(tokenHash: string) {
    await prisma.session.deleteMany({
      where: {
        tokenHash
      }
    });
  }

  async createEmailVerificationToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    const token = await prisma.emailVerificationToken.create({
      data: input,
      include: {
        user: true
      }
    });

    return {
      id: token.id,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt,
      user: mapUser(token.user)
    };
  }

  async findEmailVerificationTokenByTokenHash(tokenHash: string) {
    const token = await prisma.emailVerificationToken.findUnique({
      where: {
        tokenHash
      },
      include: {
        user: true
      }
    });

    if (!token) {
      return null;
    }

    return {
      id: token.id,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt,
      user: mapUser(token.user)
    };
  }

  async deleteEmailVerificationTokensByUserId(userId: string) {
    await prisma.emailVerificationToken.deleteMany({
      where: {
        userId
      }
    });
  }

  async consumeEmailVerificationTokenByTokenHash(tokenHash: string, consumedAt: Date) {
    await prisma.emailVerificationToken.updateMany({
      where: {
        tokenHash,
        consumedAt: null
      },
      data: {
        consumedAt
      }
    });
  }
}
