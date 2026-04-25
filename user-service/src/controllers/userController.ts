import { Request, Response } from 'express';
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
  private readonly frontendDashboardUrl =
    process.env.FRONTEND_DASHBOARD_URL || 'http://localhost:5173/';

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

  initiateGoogleAuth = async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const googleAuthUrl = this.userService.generateGoogleAuthUrl(
        this.resolveGoogleCallbackUrl(req)
      );
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

      const result = await this.userService.handleGoogleCallback(
        code,
        this.resolveGoogleCallbackUrl(req)
      );

      // Redirect directly to frontend home page with tokens as query params.
      // The frontend AuthContext will read them, store them, and clear the URL.
      const homeUrl = new URL(this.frontendDashboardUrl);
      homeUrl.searchParams.set('accessToken', result.token);
      homeUrl.searchParams.set('refreshToken', result.refreshToken);
      return res.redirect(302, homeUrl.toString());

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google authentication failed.';
      console.error('Google auth callback error:', message);

      // Redirect to frontend login page with error message
      const loginUrl = new URL('/login', this.frontendDashboardUrl);
      loginUrl.searchParams.set('error', message);
      return res.redirect(302, loginUrl.toString());
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
      const bearerToken = this.extractBearerToken(req.headers.authorization);
      const result = await this.userService.verifyAccessToken(req.body.token || bearerToken);
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

  updateUser = async (
    req: AuthenticatedRequest & Request<{ id: string }, unknown, UpdateUserRequestDto>,
    res: Response
  ): Promise<Response> => {
    try {
      const user = await this.userService.updateUser(req.user!, req.params.id, req.body);
      return res.json(user);
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

  private extractBearerToken(authHeader?: string): string | undefined {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return undefined;
    }

    return authHeader.slice('Bearer '.length).trim();
  }

  private resolveGoogleCallbackUrl(req: {
    headers: Request['headers'];
    protocol: string;
    get(name: string): string | undefined;
  }): string {
    const configuredRedirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (configuredRedirectUri && !this.isLocalhostUrl(configuredRedirectUri)) {
      return configuredRedirectUri;
    }

    const forwardedProto = req.headers['x-forwarded-proto'];
    const forwardedHost = req.headers['x-forwarded-host'];
    const proto = this.firstHeaderValue(forwardedProto) || req.protocol;
    const host = this.firstHeaderValue(forwardedHost) || req.get('host');

    return `${proto}://${host}/api/users/auth/google/callback`;
  }

  private firstHeaderValue(value: string | string[] | undefined): string | undefined {
    const rawValue = Array.isArray(value) ? value[0] : value;
    return rawValue?.split(',')[0]?.trim();
  }

  private isLocalhostUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    } catch {
      return false;
    }
  }
}
