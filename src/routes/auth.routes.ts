import { Router } from 'express';
import { login, getMe, forgotPassword, resetPassword, logout } from '../controllers/auth.controller';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

router.post('/login', login);
router.post('/logout', authenticateJWT, logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', authenticateJWT, getMe);

export default router;
