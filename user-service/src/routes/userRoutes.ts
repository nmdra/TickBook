import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { authenticate, authorizeAdmin } from '../middleware/auth';

const router = Router();
const userController = new UserController();

router.get('/auth/google', userController.initiateGoogleAuth);
router.get('/auth/google/callback', userController.googleAuthCallback);

router.post('/register', userController.register);
router.post('/login', userController.login);
router.post('/refresh-token', userController.refreshToken);
router.post('/logout', userController.logout);
router.post('/verify-token', userController.verifyToken);

router.get('/profile', authenticate, userController.getProfile);
router.get('/', authenticate, authorizeAdmin, userController.listUsers);

router.get('/:id', userController.getUserById);
router.put('/:id', authenticate, userController.updateUser);
router.delete('/:id', authenticate, userController.deleteUser);

export default router;
