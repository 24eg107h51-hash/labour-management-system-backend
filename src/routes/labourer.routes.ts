import { Router } from 'express';
import {
  getLabourers,
  getLabourerById,
  createLabourer,
  updateLabourer,
  updateLabourerStatus,
  uploadLabourerDocument,
} from '../controllers/labourer.controller';
import { authenticateJWT } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { upload } from '../middleware/upload';

const router = Router();

router.use(authenticateJWT);

router.get('/', getLabourers);
router.get('/:id', getLabourerById);
router.post('/', requireRoles('ADMIN', 'SUPERVISOR'), createLabourer);
router.put('/:id', requireRoles('ADMIN', 'SUPERVISOR'), updateLabourer);
router.patch('/:id/status', requireRoles('ADMIN', 'SUPERVISOR'), updateLabourerStatus);
router.post('/:id/documents', requireRoles('ADMIN', 'SUPERVISOR'), upload.single('file'), uploadLabourerDocument);

export default router;
