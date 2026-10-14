import { Router } from 'express';
import { createPayment, getPaymentHistory } from '../controllers/payment.controller';
import { authenticateJWT } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

const router = Router();

router.use(authenticateJWT);

router.get('/history', getPaymentHistory);
router.post('/', requireRoles('ADMIN'), createPayment);

export default router;
