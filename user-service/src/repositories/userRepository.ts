import { Repository } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Profile } from '../entities/Profile';
import { User } from '../entities/User';

export interface UpdateUserPersistenceInput {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
}

export class UserRepository {
  private get repository(): Repository<User> {
    return AppDataSource.getRepository(User);
  }

  create(data: Partial<User>): User {
    return this.repository.create(data);
  }

  async save(user: User): Promise<User> {
    return this.repository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({
      where: { email },
      relations: {
        profile: true,
      },
    });
  }

  async findByEmailWithSecrets(email: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .addSelect('user.password')
      .addSelect('user.refreshToken')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: number): Promise<User | null> {
    return this.repository.findOne({
      where: { id },
      relations: {
        profile: true,
      },
    });
  }

  async findByIdWithRefreshToken(id: number): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .addSelect('user.refreshToken')
      .where('user.id = :id', { id })
      .getOne();
  }

  async findByRefreshToken(refreshToken: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .addSelect('user.refreshToken')
      .where('user.refreshToken = :refreshToken', { refreshToken })
      .getOne();
  }

  async findPublicById(id: number): Promise<User | null> {
    return this.repository.findOne({
      where: { id },
      relations: {
        profile: true,
      },
    });
  }

  async listUsers(): Promise<User[]> {
    return this.repository.find({
      relations: {
        profile: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async updateById(id: number, changes: UpdateUserPersistenceInput): Promise<User | null> {
    const user = await this.repository.findOne({
      where: { id },
      relations: {
        profile: true,
      },
    });

    if (!user) {
      return null;
    }

    if (changes.email !== undefined) {
      user.email = changes.email;
    }

    if (changes.password !== undefined) {
      user.password = changes.password;
    }

    if (changes.role !== undefined) {
      user.role = changes.role;
    }

    if (!user.profile) {
      const profile = new Profile();
      profile.name = changes.name ?? this.buildFallbackName(user.email);
      profile.address = null;
      profile.phoneNumber = null;
      profile.totalTicketsBooked = 0;
      profile.user = user;
      user.profile = profile;
    } else if (changes.name !== undefined) {
      user.profile.name = changes.name;
    }

    return this.repository.save(user);
  }

  async deleteById(id: number): Promise<boolean> {
    const result = await this.repository.delete({
      id,
    });

    return Boolean(result.affected);
  }

  private buildFallbackName(email: string): string {
    return email.split('@')[0] || 'user';
  }
}
