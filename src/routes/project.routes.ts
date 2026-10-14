import { Router } from 'express';
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  assignLabourersToProject,
  createProjectTask,
  updateTask,
  assignLabourerToTask,
} from '../controllers/project.controller';
import { authenticateJWT } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

const router = Router();

router.use(authenticateJWT);

router.get('/', getProjects);
router.get('/:id', getProjectById);
router.post('/', requireRoles('ADMIN', 'SUPERVISOR'), createProject);
router.put('/:id', requireRoles('ADMIN', 'SUPERVISOR'), updateProject);
router.post('/:id/assign', requireRoles('ADMIN', 'SUPERVISOR'), assignLabourersToProject);
router.post('/:id/tasks', requireRoles('ADMIN', 'SUPERVISOR'), createProjectTask);
router.put('/tasks/:taskId', requireRoles('ADMIN', 'SUPERVISOR'), updateTask);
router.post('/tasks/:taskId/assign', requireRoles('ADMIN', 'SUPERVISOR'), assignLabourerToTask);

export default router;
