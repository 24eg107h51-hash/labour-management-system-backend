import { Router } from 'express';
import {
  getDashboardStats,
  getAttendanceReport,
  getWageReport,
  getProjectLabourReport,
  getProductivityReport,
  exportReportCSV,
} from '../controllers/report.controller';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

router.use(authenticateJWT);

router.get('/dashboard', getDashboardStats);
router.get('/attendance', getAttendanceReport);
router.get('/wages', getWageReport);
router.get('/projects', getProjectLabourReport);
router.get('/productivity', getProductivityReport);
router.get('/export/:reportType', exportReportCSV);

export default router;
