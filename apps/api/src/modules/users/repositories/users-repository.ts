import { prisma } from '@scrumbun/db';

export type UserSummaryRecord = {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  emailVerificationStatus: 'pending' | 'verified';
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UsersRepository = {
  listUsers(): Promise<UserSummaryRecord[]>;
  findUserById(id: string): Promise<UserSummaryRecord | null>;
};

function mapRole(role: 'USER' | 'ADMIN'): 'user' | 'admin' {
  return role === 'ADMIN' ? 'admin' : 'user';
}

function mapUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: 'USER' | 'ADMIN';
  emailVerificationStatus: 'PENDING' | 'VERIFIED';
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): UserSummaryRecord {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: mapRole(user.role),
    emailVerificationStatus: user.emailVerificationStatus === 'PENDING' ? 'pending' : 'verified',
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export class PrismaUsersRepository implements UsersRepository {
  async listUsers() {
    const users = await prisma.user.findMany({
      orderBy: {
        displayName: 'asc'
      }
    });

    return users.map(mapUser);
  }

  async findUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: {
        id
      }
    });

    return user ? mapUser(user) : null;
  }
}
