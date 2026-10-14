import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { AppError } from './errorHandler';

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  firstName: string;
  lastName: string;
  contractorId?: string | null;
  labourerId?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Authentication required. Missing token.', 401));
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_2026_labour_mgmt_system_secure_token';

    const decoded = jwt.verify(token, secret) as any;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        contractor: true,
        labourerProfile: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      return next(new AppError('User not found or account is deactivated.', 401));
    }

    req.user = {
      id: user.id,
      email: user.email,
      roles: user.userRoles.map((ur) => ur.role.name),
      firstName: user.firstName,
      lastName: user.lastName,
      contractorId: user.contractor?.id || null,
      labourerId: user.labourerProfile?.id || null,
    };

    next();
  } catch (error: any) {
    return next(new AppError('Invalid or expired authentication token.', 401));
  }
};
