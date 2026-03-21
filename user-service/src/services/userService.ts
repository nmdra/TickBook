import bcrypt from 'bcryptjs';
import jwt, { JwtPayload, Secret, SignOptions } from 'jsonwebtoken';
import {
  AuthenticatedUserPayload,
  LoginResponseDto,
  LoginUserDto,
  ProfileResponseDto,
  PublicUserDto,
  RegisterRequestDto,
  UpdateUserRequestDto,
  VerifyTokenResultDto,
} from '../dtos/auth.dto';
import { Profile } from '../entities/Profile';
import { User } from '../entities/User';
import { BookingIntegrationService } from '../integrations/BookingIntegrationService';
import { PaymentIntegrationService } from '../integrations/PaymentIntegrationService';
import {
  UpdateUserPersistenceInput,
  UserRepository,
} from '../repositories/userRepository';

const ACCESS_TOKEN_EXPIRES_IN = '24h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export class ServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class UserService {
  private readonly accessTokenSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  private readonly refreshTokenSecret = process.env.JWT_REFRESH_SECRET || this.accessTokenSecret;
  private readonly userRepository = new UserRepository();
  private readonly bookingIntegrationService = new BookingIntegrationService();
  private readonly paymentIntegrationService = new PaymentIntegrationService();

  async register(payload: RegisterRequestDto): Promise<PublicUserDto> {
    const { name, email, password, role } = payload;

    if (!name || !email || !password) {
      throw new ServiceError(400, 'Name, email, and password are required.');
    }

    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new ServiceError(409, 'Email already registered.');
    }

    const user = this.userRepository.create({
      email,
      password: await bcrypt.hash(password, 10),
      role: role || 'user',
      refreshToken: null,
    });

    const profile = new Profile();
    profile.name = name;
    profile.address = null;
    profile.phoneNumber = null;
    profile.totalTicketsBooked = 0;
    profile.user = user;

    user.profile = profile;

    const savedUser = await this.userRepository.save(user);
    const persistedUser = await this.userRepository.findById(savedUser.id);

    return this.toPublicUserDto(persistedUser ?? savedUser);
  }

  async login(email?: string, password?: string): Promise<LoginResponseDto> {
    if (!email || !password) {
      throw new ServiceError(400, 'Email and password are required.');
    }

    const user = await this.userRepository.findByEmailWithSecrets(email);

    if (!user) {
      throw new ServiceError(401, 'Invalid email or password.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new ServiceError(401, 'Invalid email or password.');
    }

    const token = this.signToken(
      { id: user.id, email: user.email, role: user.role },
      this.accessTokenSecret,
      ACCESS_TOKEN_EXPIRES_IN
    );
    const refreshToken = this.signToken(
      { id: user.id, email: user.email, role: user.role },
      this.refreshTokenSecret,
      REFRESH_TOKEN_EXPIRES_IN
    );

    user.refreshToken = refreshToken;
    await this.userRepository.save(user);

    return {
      token,
      refreshToken,
      user: this.toLoginUserDto(user),
    };
  }

  async refreshAccessToken(refreshToken?: string): Promise<{ token: string }> {
    if (!refreshToken) {
      throw new ServiceError(401, 'Invalid or expired refresh token.');
    }

    try {
      const decoded = this.verifyTokenPayload(refreshToken, this.refreshTokenSecret);
      const user = await this.userRepository.findByIdWithRefreshToken(decoded.id);

      if (!user || user.refreshToken !== refreshToken) {
        throw new ServiceError(401, 'Invalid or expired refresh token.');
      }

      return {
        token: this.signToken(
          { id: user.id, email: user.email, role: user.role },
          this.accessTokenSecret,
          ACCESS_TOKEN_EXPIRES_IN
        ),
      };
    } catch {
      throw new ServiceError(401, 'Invalid or expired refresh token.');
    }
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    const user = await this.userRepository.findByRefreshToken(refreshToken);

    if (!user) {
      return;
    }

    user.refreshToken = null;
    await this.userRepository.save(user);
  }

  async verifyAccessToken(token?: string): Promise<VerifyTokenResultDto> {
    if (!token) {
      return {
        isValid: false,
      };
    }

    try {
      const decoded = this.verifyTokenPayload(token, this.accessTokenSecret);
      return {
        isValid: true,
        user: {
          id: decoded.id,
          role: decoded.role,
        },
      };
    } catch {
      return {
        isValid: false,
      };
    }
  }

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new ServiceError(404, 'User not found.');
    }

    const [recentBookings, paymentHistory] = await Promise.all([
      this.bookingIntegrationService.fetchRecentBookings(userId),
      this.paymentIntegrationService.fetchPaymentHistory(userId),
    ]);

    return {
      ...this.toPublicUserDto(user),
      recentBookings,
      paymentHistory,
    };
  }

  async getUserById(id: string): Promise<PublicUserDto> {
    const user = await this.userRepository.findPublicById(id);

    if (!user) {
      throw new ServiceError(404, 'User not found.');
    }

    return this.toPublicUserDto(user);
  }

  async listUsers(): Promise<PublicUserDto[]> {
    const users = await this.userRepository.listUsers();

    return users.map((user) => this.toPublicUserDto(user));
  }

  async updateUser(
    actor: AuthenticatedUserPayload,
    id: string,
    payload: UpdateUserRequestDto
  ): Promise<PublicUserDto> {
    if (actor.id !== id && actor.role !== 'admin') {
      throw new ServiceError(403, 'You can only update your own profile.');
    }

    const changes: UpdateUserPersistenceInput = {};

    if (payload.name) {
      changes.name = payload.name;
    }

    if (payload.email) {
      changes.email = payload.email;
    }

    if (payload.password) {
      changes.password = await bcrypt.hash(payload.password, 10);
    }

    if (payload.role && actor.role === 'admin') {
      changes.role = payload.role;
    }

    if (Object.keys(changes).length === 0) {
      throw new ServiceError(400, 'No fields to update.');
    }

    const user = await this.userRepository.updateById(id, changes);

    if (!user) {
      throw new ServiceError(404, 'User not found.');
    }

    return this.toPublicUserDto(user);
  }

  async deleteUser(actor: AuthenticatedUserPayload, id: string): Promise<void> {
    if (actor.id !== id && actor.role !== 'admin') {
      throw new ServiceError(403, 'You can only delete your own account.');
    }

    const deleted = await this.userRepository.deleteById(id);

    if (!deleted) {
      throw new ServiceError(404, 'User not found.');
    }
  }

  private signToken(
    payload: { id: string; email: string; role: string },
    secret: string,
    expiresIn: string
  ): string {
    return jwt.sign(payload, secret as Secret, { expiresIn } as SignOptions);
  }

  private verifyTokenPayload(token: string, secret: string): AuthenticatedUserPayload {
    const decoded = jwt.verify(token, secret as Secret);

    if (typeof decoded === 'string') {
      throw new Error('Invalid token payload');
    }

    const payload = decoded as JwtPayload;
    const id = String(payload.id ?? '');
    const email = String(payload.email ?? '');
    const role = String(payload.role ?? '');

    if (!id || !role) {
      throw new Error('Invalid token payload');
    }

    return {
      id,
      email,
      role,
      iat: typeof payload.iat === 'number' ? payload.iat : undefined,
      exp: typeof payload.exp === 'number' ? payload.exp : undefined,
    };
  }

  private toPublicUserDto(user: User): PublicUserDto {
    return {
      id: user.id,
      name: user.profile?.name ?? this.buildFallbackName(user.email),
      email: user.email,
      role: user.role,
      address: user.profile?.address ?? null,
      phoneNumber: user.profile?.phoneNumber ?? null,
      totalTicketsBooked: user.profile?.totalTicketsBooked ?? 0,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
  }

  private toLoginUserDto(user: User): LoginUserDto {
    return {
      id: user.id,
      name: user.profile?.name ?? this.buildFallbackName(user.email),
      email: user.email,
      role: user.role,
    };
  }

  private buildFallbackName(email: string): string {
    return email.split('@')[0] || 'user';
  }
}
