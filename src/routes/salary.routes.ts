import { Router } from 'express';
import {
  getSalaries,
  getSalaryById,
  calculateSalary,
  approveSalary,
  getSalarySlip,
  createLabourAdvance,
  getLabourAdvances,
} from '../controllers/salary.controller';
import { authenticateJWT } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

const router = Router();

router.use(authenticateJWT);

router.get('/', getSalaries);
router.get('/advances', getLabourAdvances);
router.post('/advances', requireRoles('ADMIN', 'SUPERVISOR'), createLabourAdvance);
router.get('/:id', getSalaryById);
router.get('/:id/slip', getSalarySlip);
router.post('/calculate', requireRoles('ADMIN', 'SUPERVISOR'), calculateSalary);
router.post('/:id/approve', requireRoles('ADMIN'), approveSalary);

export default router;
