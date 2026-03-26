import { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
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
import { logger } from '../utils/logger';

export class UserController {
  private readonly userService = new UserService();
  private readonly frontendSuccessUrl =
    process.env.FRONTEND_SUCCESS_URL || 'http://localhost:3002/google-auth-success.html';
  private readonly frontendDashboardUrl =
    process.env.FRONTEND_DASHBOARD_URL || 'http://localhost:3000/dashboard';

  register = async (
    req: Request<unknown, unknown, RegisterRequestDto>,
    res: Response
  ): Promise<Response> => {
    try {
      const user = await this.userService.register(req.body);
      return res.status(201).json(user);
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
      return res.json(result);
    } catch (error) {
      return this.handleError(res, error, 'Login error:');
    }
  };

  initiateGoogleAuth = async (_req: Request, res: Response): Promise<Response | void> => {
    try {
      const googleAuthUrl = this.userService.generateGoogleAuthUrl();
      return res.redirect(302, googleAuthUrl);
    } catch (error) {
      return this.handleError(res, error, 'Initiate Google auth error:');
    }
  };

  googleAuthCallback = async (
    req: Request<unknown, unknown, unknown, { code?: string; error?: string }>,
    res: Response
  ): Promise<Response | void> => {
    try {
      if (req.query.error) {
        throw new ServiceError(400, `Google authentication failed: ${req.query.error}`);
      }

      const code = typeof req.query.code === 'string' ? req.query.code : '';

      if (!code) {
        throw new ServiceError(400, 'Authorization code is required.');
      }

      const result = await this.userService.handleGoogleCallback(code);
      return res.redirect(
        302,
        this.buildFrontendRedirectUrl({
          accessToken: result.token,
          refreshToken: result.refreshToken,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google authentication failed.';

      try {
        return res.redirect(
          302,
          this.buildFrontendRedirectUrl({
            error: message,
          })
        );
      } catch {
        return this.handleError(res, error, 'Google auth callback error:');
      }
    }
  };

  refreshToken = async (
    req: Request<unknown, unknown, RefreshTokenRequestDto>,
    res: Response
  ): Promise<Response> => {
    try {
      const result = await this.userService.refreshAccessToken(req.body.refreshToken);
      return res.status(200).json(result);
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
      return res.status(200).json({ message: 'Logged out successfully.' });
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
      return res.status(result.isValid ? 200 : 401).json(result);
    } catch (error) {
      return this.handleError(res, error, 'Verify token error:');
    }
  };

  getProfile = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    try {
      const profile = await this.userService.getProfile(req.user!.id);
      return res.json(profile);
    } catch (error) {
      return this.handleError(res, error, 'Get profile error:');
    }
  };

  getUserById = async (req: Request<{ id: string }>, res: Response): Promise<Response> => {
    try {
      const user = await this.userService.getUserById(req.params.id);
      return res.json(user);
    } catch (error) {
      return this.handleError(res, error, 'Get user by ID error:');
    }
  };

  listUsers = async (_req: AuthenticatedRequest, res: Response): Promise<Response> => {
    try {
      const users = await this.userService.listUsers();
      return res.json(users);
    } catch (error) {
      return this.handleError(res, error, 'List users error:');
    }
  };

  listUsersForNotifications = async (_req: Request, res: Response): Promise<Response> => {
    const configuredToken = process.env.INTERNAL_SERVICE_TOKEN;
    const providedToken = _req.get('x-internal-token');

    const isTokenValid =
      !!configuredToken &&
      !!providedToken &&
      this.tokensEqual(providedToken, configuredToken);

    if (!isTokenValid) {
      logger.warn(
        `Forbidden internal users access attempt from ${_req.ip || _req.socket?.remoteAddress || 'unknown'}`
      );
      return res.status(403).json({ error: 'Forbidden' });
    }

    try {
      const users = await this.userService.listUsers();
      return res.json(
        users.map((user) => ({
          id: user.id,
          email: user.email,
        }))
      );
    } catch (error) {
      return this.handleError(res, error, 'List users for notifications error:');
    }
  };

  updateUser = async (
    req: AuthenticatedRequest & Request<{ id: string }, unknown, UpdateUserRequestDto>,
    res: Response
  ): Promise<Response> => {
    try {
      const user = await this.userService.updateUser(req.user!, req.params.id, req.body);
      return res.json(user);
    } catch (error) {
      if (error instanceof Error && error.message === 'EMAIL_ALREADY_EXISTS') {
        return res
          .status(409)
          .json({ message: 'Email is already in use by another account' });
      }

      return this.handleError(res, error, 'Update user error:');
    }
  };

  deleteUser = async (
    req: AuthenticatedRequest & Request<{ id: string }>,
    res: Response
  ): Promise<Response> => {
    try {
      await this.userService.deleteUser(req.user!, req.params.id);
      return res.json({ message: 'User deleted successfully.' });
    } catch (error) {
      return this.handleError(res, error, 'Delete user error:');
    }
  };

  private handleError(
    res: Response,
    error: unknown,
    logPrefix: string
  ): Response {
    const message = error instanceof Error ? error.message : String(error);
    console.error(logPrefix, message);

    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Internal server error.' });
  }

  private buildFrontendRedirectUrl(params: Record<string, string>): string {
    const redirectUrl = new URL(this.frontendSuccessUrl);

    Object.entries(params).forEach(([key, value]) => {
      redirectUrl.searchParams.set(key, value);
    });

    redirectUrl.searchParams.set('dashboardUrl', this.frontendDashboardUrl);

    return redirectUrl.toString();
  }

  private tokensEqual(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);

    if (aBuffer.length !== bBuffer.length) {
      return false;
    }

    return timingSafeEqual(aBuffer, bBuffer);
  }
}
