import { Router } from 'express';
import {
  getAttendance,
  recordAttendance,
  bulkRecordAttendance,
  updateAttendance,
  approveAttendance,
  getAttendanceSummary,
} from '../controllers/attendance.controller';
import { authenticateJWT } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

const router = Router();

router.use(authenticateJWT);

router.get('/', getAttendance);
router.get('/summary', getAttendanceSummary);
router.post('/', requireRoles('ADMIN', 'SUPERVISOR'), recordAttendance);
router.post('/bulk', requireRoles('ADMIN', 'SUPERVISOR'), bulkRecordAttendance);
router.put('/:id', requireRoles('ADMIN', 'SUPERVISOR'), updateAttendance);
router.post('/approve', requireRoles('ADMIN', 'SUPERVISOR'), approveAttendance);

export default router;
