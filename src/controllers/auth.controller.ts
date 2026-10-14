import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../middleware/audit';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return next(new AppError('Please provide email and password.', 400));
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        labourerProfile: true,
        contractor: true,
      },
    });

    if (!user) {
      return next(new AppError('Invalid email or password.', 401));
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return next(new AppError('Invalid email or password.', 401));
    }

    if (user.status !== 'ACTIVE') {
      return next(new AppError('Your account has been deactivated. Please contact administrator.', 403));
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const token = jwt.sign(
      { userId: user.id, roles },
      process.env.JWT_SECRET || 'super_secret_jwt_key_2026_labour_mgmt_system_secure_token',
      { expiresIn: '7d' }
    );

    await logAudit(req, 'LOGIN', 'AUTH', user.id, { email: user.email });

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          avatarUrl: user.avatarUrl,
          roles,
          contractorId: user.contractor?.id || null,
          labourerId: user.labourerProfile?.id || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new AppError('Not authenticated.', 401));
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        labourerProfile: true,
        contractor: true,
      },
    });

    if (!user) {
      return next(new AppError('User not found.', 404));
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        roles: user.userRoles.map((ur) => ur.role.name),
        contractorId: user.contractor?.id || null,
        labourerId: user.labourerProfile?.id || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email) {
      return next(new AppError('Email is required.', 400));
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      // Return success even if not found to prevent user enumeration
      return res.json({
        success: true,
        message: 'If the email exists in our records, a password reset instruction has been logged.',
      });
    }

    await logAudit(req, 'UPDATE', 'AUTH', user.id, { action: 'FORGOT_PASSWORD_REQUESTED' });

    res.json({
      success: true,
      message: 'Password reset link / token generated successfully.',
      resetToken: 'SAMPLE_RESET_TOKEN_' + Buffer.from(email).toString('hex').slice(0, 10),
    });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return next(new AppError('Email and newPassword are required.', 400));
    }

    if (newPassword.length < 6) {
      return next(new AppError('Password must be at least 6 characters.', 400));
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return next(new AppError('User not found.', 404));
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await logAudit(req, 'UPDATE', 'AUTH', user.id, { action: 'PASSWORD_RESET_SUCCESSFUL' });

    res.json({
      success: true,
      message: 'Password has been reset successfully. Please login with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user) {
      await logAudit(req, 'LOGOUT', 'AUTH', req.user.id);
    }
    res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    next(error);
  }
};
