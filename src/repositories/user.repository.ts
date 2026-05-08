import { PrismaClient, User, UserRole, Prisma } from "@prisma/client";
import { getPrismaClient } from "@/config/database";
import { DatabaseError } from "@/utils/errors";

export class UserRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  async findById(id: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to find user by ID");
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    } catch {
      throw new DatabaseError("Failed to find user by email");
    }
  }

  async create(data: { email: string; passwordHash: string; role?: UserRole }): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash: data.passwordHash,
          role: data.role ?? UserRole.USER,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DatabaseError("Email already in use");
      }
      throw new DatabaseError("Failed to create user");
    }
  }

  async update(id: string, data: Partial<Omit<User, "id" | "createdAt">>): Promise<User> {
    try {
      return await this.prisma.user.update({ where: { id }, data });
    } catch {
      throw new DatabaseError("Failed to update user");
    }
  }

  async incrementFailedLoginAttempts(id: string): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { failedLoginAttempts: { increment: 1 } },
      });
    } catch {
      throw new DatabaseError("Failed to update login attempts");
    }
  }

  async lockAccount(id: string, lockedUntil: Date): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { lockedUntil, failedLoginAttempts: 0 },
      });
    } catch {
      throw new DatabaseError("Failed to lock account");
    }
  }

  async resetLoginAttempts(id: string, lastLoginIp?: string): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          lastLoginIp: lastLoginIp ?? null,
        },
      });
    } catch {
      throw new DatabaseError("Failed to reset login attempts");
    }
  }

  async markEmailVerified(id: string): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { isVerified: true, isActive: true },
      });
    } catch {
      throw new DatabaseError("Failed to mark email as verified");
    }
  }

  async updatePassword(id: string, passwordHash: string): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { passwordHash, updatedAt: new Date() },
      });
    } catch {
      throw new DatabaseError("Failed to update password");
    }
  }

  async deactivate(id: string): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { isActive: false },
      });
    } catch {
      throw new DatabaseError("Failed to deactivate user");
    }
  }

  async delete(id: string): Promise<User> {
    try {
      return await this.prisma.user.delete({ where: { id } });
    } catch {
      throw new DatabaseError("Failed to delete user");
    }
  }

  async findMany(options: {
    page: number;
    limit: number;
    role?: UserRole;
    isActive?: boolean;
    isVerified?: boolean;
    search?: string;
  }): Promise<{ users: User[]; total: number }> {
    const skip = (options.page - 1) * options.limit;
    const where: Prisma.UserWhereInput = {};
    if (options.role !== undefined) where.role = options.role;
    if (options.isActive !== undefined) where.isActive = options.isActive;
    if (options.isVerified !== undefined) where.isVerified = options.isVerified;
    if (options.search) {
      const q = options.search.trim();
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ];
    }

    try {
      const [users, total] = await this.prisma.$transaction([
        this.prisma.user.findMany({ where, skip, take: options.limit, orderBy: { createdAt: "desc" } }),
        this.prisma.user.count({ where }),
      ]);
      return { users, total };
    } catch {
      throw new DatabaseError("Failed to fetch users");
    }
  }

  async getPasswordHistory(userId: string, limit: number): Promise<string[]> {
    try {
      const history = await this.prisma.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { passwordHash: true },
      });
      return history.map((h) => h.passwordHash);
    } catch {
      throw new DatabaseError("Failed to fetch password history");
    }
  }

  async addPasswordHistory(userId: string, passwordHash: string, limit: number): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.passwordHistory.create({ data: { userId, passwordHash } });
        const oldest = await tx.passwordHistory.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
          skip: limit,
          select: { id: true },
        });
        if (oldest.length > 0) {
          await tx.passwordHistory.deleteMany({ where: { id: { in: oldest.map((o) => o.id) } } });
        }
      });
    } catch {
      throw new DatabaseError("Failed to save password history");
    }
  }
}

export const userRepository = new UserRepository();
