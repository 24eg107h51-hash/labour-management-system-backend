import { Router } from 'express';
import authRoutes from './auth.routes';
import labourerRoutes from './labourer.routes';
import contractorRoutes from './contractor.routes';
import projectRoutes from './project.routes';
import attendanceRoutes from './attendance.routes';
import salaryRoutes from './salary.routes';
import paymentRoutes from './payment.routes';
import leaveRoutes from './leave.routes';
import reportRoutes from './report.routes';
import notificationRoutes from './notification.routes';
import settingsRoutes from './settings.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/labourers', labourerRoutes);
router.use('/contractors', contractorRoutes);
router.use('/projects', projectRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/salaries', salaryRoutes);
router.use('/payments', paymentRoutes);
router.use('/leaves', leaveRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/settings', settingsRoutes);

export default router;
