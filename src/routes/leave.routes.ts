import { Router } from 'express';
import {
  getLeaves,
  createLeaveRequest,
  reviewLeaveRequest,
  getLeaveBalances,
} from '../controllers/leave.controller';
import { authenticateJWT } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

const router = Router();

router.use(authenticateJWT);

router.get('/', getLeaves);
router.post('/', createLeaveRequest);
router.post('/:id/review', requireRoles('ADMIN', 'SUPERVISOR'), reviewLeaveRequest);
router.get('/balances/:labourerId', getLeaveBalances);

export default router;
