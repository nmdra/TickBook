import { Request, Response } from 'express';
import { ApiResponse } from '../dtos/common.dto';
import {
  LoginRequestDto,
  LogoutRequestDto,
  RefreshTokenRequestDto,
  RegisterRequestDto,
  UpdateUserRequestDto,
  VerifyTokenRequestDto,
} from '../dtos/auth.dto';
import { AuthenticatedRequest } from '../middleware/auth';
import { ServiceError, UserService } from '../services/userService';

export class UserController {
  private readonly userService = new UserService();

  register = async (
    req: Request<unknown, unknown, RegisterRequestDto>,
    res: Response
  ): Promise<Response> => {
    try {
      const user = await this.userService.register(req.body);
      return this.respond(res, 201, 'User registered successfully', user);
    } catch (error) {
      return this.handleError(res, error, 'Register error:');
    }
  };

  login = async (
    req: Request<unknown, unknown, LoginRequestDto>,
    res: Response
  ): Promise<Response> => {
    try {
      const result = await this.userService.login(req.body.email, req.body.password);
      return this.respond(res, 200, 'Login successful', result);
    } catch (error) {
      return this.handleError(res, error, 'Login error:');
    }
  };

  refreshToken = async (
    req: Request<unknown, unknown, RefreshTokenRequestDto>,
    res: Response
  ): Promise<Response> => {
    try {
      const result = await this.userService.refreshAccessToken(req.body.refreshToken);
      return this.respond(res, 200, 'Access token refreshed successfully', result);
    } catch (error) {
      return this.handleError(res, error, 'Refresh token error:');
    }
  };

  logout = async (
    req: Request<unknown, unknown, LogoutRequestDto>,
    res: Response
  ): Promise<Response> => {
    try {
      await this.userService.logout(req.body.refreshToken);
      return this.respond(res, 200, 'Logged out successfully.');
    } catch (error) {
      return this.handleError(res, error, 'Logout error:');
    }
  };

  verifyToken = async (
    req: Request<unknown, unknown, VerifyTokenRequestDto>,
    res: Response
  ): Promise<Response> => {
    try {
      const result = await this.userService.verifyAccessToken(req.body.token);

      if (result.isValid) {
        return this.respond(res, 200, 'Token verification completed', result);
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token.',
        data: result,
      } satisfies ApiResponse);
    } catch (error) {
      return this.handleError(res, error, 'Verify token error:');
    }
  };

  getProfile = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<Response> => {
    try {
      const profile = await this.userService.getProfile(req.user!.id);
      return this.respond(res, 200, 'User profile fetched successfully', profile);
    } catch (error) {
      return this.handleError(res, error, 'Get profile error:');
    }
  };

  getUserById = async (
    req: Request<{ id: string }>,
    res: Response
  ): Promise<Response> => {
    try {
      const user = await this.userService.getUserById(req.params.id);
      return this.respond(res, 200, 'User fetched successfully', user);
    } catch (error) {
      return this.handleError(res, error, 'Get user by ID error:');
    }
  };

  listUsers = async (
    _req: AuthenticatedRequest,
    res: Response
  ): Promise<Response> => {
    try {
      const users = await this.userService.listUsers();
      return this.respond(res, 200, 'Users fetched successfully', users);
    } catch (error) {
      return this.handleError(res, error, 'List users error:');
    }
  };

  updateUser = async (
    req: AuthenticatedRequest & Request<{ id: string }, unknown, UpdateUserRequestDto>,
    res: Response
  ): Promise<Response> => {
    try {
      const user = await this.userService.updateUser(req.user!, req.params.id, req.body);
      return this.respond(res, 200, 'User updated successfully', user);
    } catch (error) {
      return this.handleError(res, error, 'Update user error:');
    }
  };

  deleteUser = async (
    req: AuthenticatedRequest & Request<{ id: string }>,
    res: Response
  ): Promise<Response> => {
    try {
      await this.userService.deleteUser(req.user!, req.params.id);
      return this.respond(res, 200, 'User deleted successfully.');
    } catch (error) {
      return this.handleError(res, error, 'Delete user error:');
    }
  };

  private respond<T>(
    res: Response,
    statusCode: number,
    message: string,
    data?: T
  ): Response {
    if (data === undefined || data === null) {
      return res.status(statusCode).json({
        success: true,
        message,
      } satisfies ApiResponse);
    }

    return res.status(statusCode).json({
      success: true,
      message,
      data,
    } satisfies ApiResponse<T>);
  }

  private handleError(
    res: Response,
    error: unknown,
    logPrefix: string
  ): Response {
    const message = error instanceof Error ? error.message : String(error);
    console.error(logPrefix, message);

    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      } satisfies ApiResponse);
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    } satisfies ApiResponse);
  }
}
