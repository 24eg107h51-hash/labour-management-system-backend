import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export const requireRoles = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Unauthorized: Authentication required.', 401));
    }

    const hasPermission = req.user.roles.some((role) =>
      allowedRoles.includes(role) || role === 'ADMIN'
    );

    if (!hasPermission) {
      return next(
        new AppError(
          `Access Forbidden: Required role [${allowedRoles.join(', ')}]`,
          403
        )
      );
    }

    next();
  };
};
