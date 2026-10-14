import { Router } from 'express';
import {
  getContractors,
  getContractorById,
  createContractor,
  updateContractor,
  getContractorStatement,
} from '../controllers/contractor.controller';
import { authenticateJWT } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

const router = Router();

router.use(authenticateJWT);

router.get('/', getContractors);
router.get('/:id', getContractorById);
router.post('/', requireRoles('ADMIN', 'SUPERVISOR'), createContractor);
router.put('/:id', requireRoles('ADMIN'), updateContractor);
router.get('/:id/statement', getContractorStatement);

export default router;
