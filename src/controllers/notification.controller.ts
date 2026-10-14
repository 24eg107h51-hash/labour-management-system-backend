import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const labourerId = req.user?.labourerId;

    const notifications = await prisma.notification.findMany({
      where: {
        OR: [
          ...(userId ? [{ userId }] : []),
          ...(labourerId ? [{ labourerId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const unreadCount = await prisma.notification.count({
      where: {
        OR: [
          ...(userId ? [{ userId }] : []),
          ...(labourerId ? [{ labourerId }] : []),
        ],
        isRead: false,
      },
    });

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const notification = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    res.json({
      success: true,
      message: 'Notification marked as read.',
      data: notification,
    });
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const labourerId = req.user?.labourerId;

    await prisma.notification.updateMany({
      where: {
        OR: [
          ...(userId ? [{ userId }] : []),
          ...(labourerId ? [{ labourerId }] : []),
        ],
        isRead: false,
      },
      data: { isRead: true },
    });

    res.json({
      success: true,
      message: 'All notifications marked as read.',
    });
  } catch (error) {
    next(error);
  }
};
