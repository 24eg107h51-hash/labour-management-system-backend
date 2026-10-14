import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../middleware/audit';

export const getSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await prisma.systemSetting.findMany({
      orderBy: { category: 'asc' },
    });

    const grouped = settings.reduce((acc: any, item) => {
      if (!acc[item.category]) acc[item.category] = {};
      acc[item.category][item.key] = item.value;
      return acc;
    }, {});

    res.json({
      success: true,
      data: grouped,
      raw: settings,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { settings } = req.body; // Array<{ key: string, value: string, category?: string }>

    if (!settings || !Array.isArray(settings)) {
      return next(new AppError('Array of settings is required.', 400));
    }

    const updated = [];
    for (const s of settings) {
      const record = await prisma.systemSetting.upsert({
        where: { key: s.key },
        update: { value: String(s.value) },
        create: {
          key: s.key,
          value: String(s.value),
          category: s.category || 'SYSTEM',
        },
      });
      updated.push(record);
    }

    await logAudit(req, 'UPDATE', 'SETTINGS', undefined, { updatedKeys: settings.map((s) => s.key) });

    res.json({
      success: true,
      message: 'System settings updated successfully.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const getAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module, action, limit = 50 } = req.query;
    const where: any = {};

    if (module) where.module = module as string;
    if (action) where.action = action as string;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string, 10),
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        avatarUrl: true,
        createdAt: true,
        userRoles: {
          include: { role: true },
        },
      },
    });

    const formatted = users.map((u) => ({
      ...u,
      roles: u.userRoles.map((ur) => ur.role.name),
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, firstName, lastName, phone, role } = req.body;

    if (!email || !password || !firstName || !lastName || !role) {
      return next(new AppError('Email, password, firstName, lastName, and role are required.', 400));
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return next(new AppError('A user with this email already exists.', 409));
    }

    const targetRole = await prisma.role.findUnique({ where: { name: role } });
    if (!targetRole) {
      return next(new AppError(`Invalid role: ${role}`, 400));
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        phone,
        status: 'ACTIVE',
        userRoles: {
          create: { roleId: targetRole.id },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    await logAudit(req, 'CREATE_USER', 'SETTINGS', user.id, { email, role });

    res.status(201).json({
      success: true,
      message: 'User created successfully.',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};
