import { Router } from 'express';
import {
  getSettings,
  updateSettings,
  getAuditLogs,
  getUsers,
  createUser,
} from '../controllers/settings.controller';
import { authenticateJWT } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

const router = Router();

router.use(authenticateJWT);

router.get('/', getSettings);
router.put('/', requireRoles('ADMIN'), updateSettings);
router.get('/audit-logs', requireRoles('ADMIN'), getAuditLogs);
router.get('/users', requireRoles('ADMIN'), getUsers);
router.post('/users', requireRoles('ADMIN'), createUser);

export default router;
