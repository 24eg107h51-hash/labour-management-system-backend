import { Request } from 'express';
import prisma from '../config/database';

export const logAudit = async (
  req: Request,
  action: string,
  module: string,
  targetId?: string,
  details?: any
) => {
  try {
    const userId = req.user?.id || null;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    await prisma.auditLog.create({
      data: {
        userId,
        action,
        module,
        targetId,
        details: typeof details === 'string' ? details : JSON.stringify(details || {}),
        ipAddress,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
};
