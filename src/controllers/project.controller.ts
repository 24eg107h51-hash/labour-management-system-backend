import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../middleware/audit';

// Generate project code: PRJ-YYYY-XXX
const generateProjectCode = async (): Promise<string> => {
  const currentYear = new Date().getFullYear();
  const prefix = `PRJ-${currentYear}-`;

  const lastProject = await prisma.project.findFirst({
    where: { projectCode: { startsWith: prefix } },
    orderBy: { projectCode: 'desc' },
  });

  if (!lastProject) {
    return `${prefix}001`;
  }

  const parts = lastProject.projectCode.split('-');
  const seqNum = parseInt(parts[2] || '0', 10);
  return `${prefix}${(seqNum + 1).toString().padStart(3, '0')}`;
};

export const getProjects = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, search } = req.query;
    const where: any = {};

    if (status) {
      where.status = status as string;
    }

    if (search) {
      const s = (search as string).trim();
      where.OR = [
        { name: { contains: s } },
        { projectCode: { contains: s } },
        { clientName: { contains: s } },
        { location: { contains: s } },
      ];
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { projectAssignments: true, workTasks: true, attendances: true },
        },
      },
    });

    res.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    next(error);
  }
};

export const getProjectById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        projectAssignments: {
          where: { status: 'ACTIVE' },
          include: {
            labourer: true,
            contractor: true,
          },
        },
        workTasks: {
          include: {
            assignments: {
              include: {
                labourer: { select: { id: true, labourId: true, firstName: true, lastName: true } },
              },
            },
          },
        },
        documents: true,
      },
    });

    if (!project) {
      return next(new AppError('Project not found.', 404));
    }

    // Calculate actual labour costs incurred from attendance
    const attendances = await prisma.attendance.findMany({
      where: { projectId: id, isApproved: true },
      include: { labourer: true },
    });

    const totalLabourCost = attendances.reduce((acc, att) => {
      const dailyRate = att.labourer.dailyWageRate;
      let dayCost = (att.workingHours / 8) * dailyRate;
      if (att.overtimeHours > 0) {
        dayCost += att.overtimeHours * ((dailyRate / 8) * 1.5);
      }
      return acc + dayCost;
    }, 0);

    res.json({
      success: true,
      data: {
        ...project,
        computedLabourCost: Math.round(totalLabourCost * 100) / 100,
        totalManDays: attendances.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      description,
      clientName,
      location,
      startDate,
      endDate,
      estimatedBudget,
      managerId,
    } = req.body;

    if (!name || !startDate) {
      return next(new AppError('Project name and start date are required.', 400));
    }

    const projectCode = await generateProjectCode();

    const project = await prisma.project.create({
      data: {
        projectCode,
        name,
        description,
        clientName,
        location,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        estimatedBudget: parseFloat(estimatedBudget) || 0.0,
        managerId: managerId || req.user?.id,
        status: 'ACTIVE',
      },
    });

    await logAudit(req, 'CREATE', 'PROJECT', project.id, { projectCode, name });

    res.status(201).json({
      success: true,
      message: 'Project created successfully.',
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const updateData = { ...req.body };

    delete updateData.id;
    delete updateData.projectCode;

    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);
    if (updateData.estimatedBudget) updateData.estimatedBudget = parseFloat(updateData.estimatedBudget);

    const updated = await prisma.project.update({
      where: { id },
      data: updateData,
    });

    await logAudit(req, 'UPDATE', 'PROJECT', id, updateData);

    res.json({
      success: true,
      message: 'Project updated successfully.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const assignLabourersToProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.id as string;
    const { labourerIds, contractorId, role, notes } = req.body;

    if (!labourerIds || !Array.isArray(labourerIds) || labourerIds.length === 0) {
      return next(new AppError('Array of labourerIds is required.', 400));
    }

    const createdAssignments = [];
    for (const labourerId of labourerIds) {
      // Upsert assignment to prevent duplicate errors
      const assignment = await prisma.projectAssignment.upsert({
        where: {
          projectId_labourerId_assignedDate: {
            projectId,
            labourerId,
            assignedDate: new Date(new Date().toDateString()), // Today's date
          },
        },
        update: {
          status: 'ACTIVE',
          role: role || 'Field Worker',
          contractorId: contractorId || null,
          notes: notes || null,
        },
        create: {
          projectId,
          labourerId,
          contractorId: contractorId || null,
          role: role || 'Field Worker',
          status: 'ACTIVE',
          notes: notes || null,
          assignedDate: new Date(new Date().toDateString()),
        },
      });
      createdAssignments.push(assignment);
    }

    await logAudit(req, 'ASSIGN_LABOURERS', 'PROJECT', projectId, {
      count: createdAssignments.length,
    });

    res.json({
      success: true,
      message: `${createdAssignments.length} labourers assigned to project successfully.`,
      data: createdAssignments,
    });
  } catch (error) {
    next(error);
  }
};

export const createProjectTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.id as string;
    const { title, description, taskType, priority, targetQuantity, unit, startDate, dueDate } = req.body;

    if (!title) {
      return next(new AppError('Task title is required.', 400));
    }

    const task = await prisma.workTask.create({
      data: {
        projectId,
        title,
        description,
        taskType,
        priority: priority || 'MEDIUM',
        targetQuantity: parseFloat(targetQuantity) || 0.0,
        unit: unit || 'units',
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: 'PENDING',
      },
    });

    await logAudit(req, 'CREATE_TASK', 'PROJECT', projectId, { taskId: task.id, title });

    res.status(201).json({
      success: true,
      message: 'Work task created successfully.',
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.taskId as string;
    const updateData = { ...req.body };

    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.dueDate) updateData.dueDate = new Date(updateData.dueDate);
    if (updateData.targetQuantity) updateData.targetQuantity = parseFloat(updateData.targetQuantity);

    const task = await prisma.workTask.update({
      where: { id: taskId },
      data: updateData,
    });

    res.json({
      success: true,
      message: 'Work task updated.',
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

export const assignLabourerToTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.taskId as string;
    const { labourerId, assignedHours, completedQuantity, productivityScore, status, supervisorNotes } = req.body;

    if (!labourerId) {
      return next(new AppError('labourerId is required.', 400));
    }

    const assignment = await prisma.taskAssignment.create({
      data: {
        taskId,
        labourerId,
        assignedHours: parseFloat(assignedHours) || 8.0,
        completedQuantity: parseFloat(completedQuantity) || 0.0,
        productivityScore: parseFloat(productivityScore) || 100.0,
        status: status || 'ASSIGNED',
        supervisorNotes,
        approvedById: req.user?.id,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Labourer assigned to work task.',
      data: assignment,
    });
  } catch (error) {
    next(error);
  }
};
