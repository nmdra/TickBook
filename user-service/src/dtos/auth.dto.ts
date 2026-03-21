export type UpstreamRecord = Record<string, unknown>;

export interface RegisterRequestDto {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
}

export interface LoginRequestDto {
  email?: string;
  password?: string;
}

export interface UpdateUserRequestDto {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
}

export interface RefreshTokenRequestDto {
  refreshToken?: string;
}

export interface LogoutRequestDto {
  refreshToken?: string;
}

export interface VerifyTokenRequestDto {
  token?: string;
}

export interface AuthenticatedUserPayload {
  id: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface PublicUserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  address: string | null;
  phoneNumber: string | null;
  totalTicketsBooked: number;
  created_at: Date;
  updated_at: Date;
}

export interface LoginUserDto {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface LoginResponseDto {
  token: string;
  refreshToken: string;
  user: LoginUserDto;
}

export interface ProfileResponseDto extends PublicUserDto {
  recentBookings: UpstreamRecord[];
  paymentHistory: UpstreamRecord[];
}

export type VerifyTokenResultDto =
  | {
      isValid: true;
      user: {
        id: string;
        role: string;
      };
    }
  | {
      isValid: false;
    };
