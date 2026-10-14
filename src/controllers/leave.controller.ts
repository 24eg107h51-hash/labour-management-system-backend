import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../middleware/audit';

export const getLeaves = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, labourerId } = req.query;
    const where: any = {};

    if (req.user?.roles.includes('LABOURER') && req.user.labourerId) {
      where.labourerId = req.user.labourerId;
    } else if (labourerId) {
      where.labourerId = labourerId as string;
    }

    if (status) where.status = status as string;

    const leaves = await prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        labourer: {
          select: { id: true, labourId: true, firstName: true, lastName: true, phone: true },
        },
        reviewedBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    res.json({
      success: true,
      data: leaves,
    });
  } catch (error) {
    next(error);
  }
};

export const createLeaveRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let { labourerId, leaveType, startDate, endDate, totalDays, reason } = req.body;

    if (req.user?.roles.includes('LABOURER') && req.user.labourerId) {
      labourerId = req.user.labourerId;
    }

    if (!labourerId || !startDate || !endDate || !reason) {
      return next(new AppError('labourerId, startDate, endDate, and reason are required.', 400));
    }

    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    const days = parseFloat(totalDays) || Math.max(1, Math.ceil((eDate.getTime() - sDate.getTime()) / (1000 * 3600 * 24)) + 1);

    const leave = await prisma.leaveRequest.create({
      data: {
        labourerId,
        leaveType: leaveType || 'CASUAL',
        startDate: sDate,
        endDate: eDate,
        totalDays: days,
        reason,
        status: 'PENDING',
      },
    });

    await logAudit(req, 'CREATE', 'LEAVE', leave.id, { labourerId, days, leaveType });

    res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully.',
      data: leave,
    });
  } catch (error) {
    next(error);
  }
};

export const reviewLeaveRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { status, reviewNotes } = req.body; // status: APPROVED or REJECTED

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return next(new AppError('Status must be either APPROVED or REJECTED.', 400));
    }

    const leave = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { labourer: true },
    });

    if (!leave) {
      return next(new AppError('Leave request not found.', 404));
    }

    if (leave.status !== 'PENDING') {
      return next(new AppError(`Leave request is already in '${leave.status}' status.`, 400));
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status,
          reviewedById: req.user?.id,
          reviewNotes: reviewNotes || null,
        },
      });

      if (status === 'APPROVED') {
        // 1. Update Leave Balance
        const currentYear = leave.startDate.getFullYear();
        const balance = await tx.leaveBalance.findUnique({
          where: {
            labourerId_year: {
              labourerId: leave.labourerId,
              year: currentYear,
            },
          },
        });

        if (balance) {
          const updateField =
            leave.leaveType === 'SICK'
              ? 'usedSick'
              : leave.leaveType === 'ANNUAL'
              ? 'usedAnnual'
              : 'usedCasual';

          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              [updateField]: (balance as any)[updateField] + leave.totalDays,
            },
          });
        }

        // 2. Automatically mark attendance as PAID_LEAVE for those dates
        const curDate = new Date(leave.startDate);
        while (curDate <= leave.endDate) {
          const normDate = new Date(Date.UTC(curDate.getUTCFullYear(), curDate.getUTCMonth(), curDate.getUTCDate()));

          // If attendance doesn't exist, create it as PAID_LEAVE
          await tx.attendance.upsert({
            where: {
              labourerId_date: {
                labourerId: leave.labourerId,
                date: normDate,
              },
            },
            update: {
              status: 'PAID_LEAVE',
              workingHours: 8.0,
              isApproved: true,
              approvedById: req.user?.id,
              approvalNotes: `Approved leave request #${leave.id.slice(0, 8)}`,
            },
            create: {
              labourerId: leave.labourerId,
              date: normDate,
              status: 'PAID_LEAVE',
              workingHours: 8.0,
              isApproved: true,
              approvedById: req.user?.id,
              approvalNotes: `Approved leave request #${leave.id.slice(0, 8)}`,
            },
          });

          curDate.setUTCDate(curDate.getUTCDate() + 1);
        }

        // 3. Notification to labourer
        await tx.notification.create({
          data: {
            userId: leave.labourer.userId || undefined,
            labourerId: leave.labourerId,
            title: 'Leave Request Approved',
            message: `Your ${leave.leaveType} leave for ${leave.totalDays} day(s) has been approved.`,
            type: 'LEAVE',
            link: '/leaves',
          },
        });
      } else {
        // Notification for rejection
        await tx.notification.create({
          data: {
            userId: leave.labourer.userId || undefined,
            labourerId: leave.labourerId,
            title: 'Leave Request Rejected',
            message: `Your leave request was rejected: ${reviewNotes || 'No notes provided'}`,
            type: 'LEAVE',
            link: '/leaves',
          },
        });
      }

      return updated;
    });

    await logAudit(req, 'REVIEW', 'LEAVE', id, { status, reviewNotes });

    res.json({
      success: true,
      message: `Leave request ${status.toLowerCase()} successfully.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getLeaveBalances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const labourerId = req.params.labourerId as string;
    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();

    const balance = await prisma.leaveBalance.findUnique({
      where: {
        labourerId_year: {
          labourerId,
          year,
        },
      },
    });

    res.json({
      success: true,
      data: balance || {
        year,
        casualLeave: 12,
        sickLeave: 10,
        annualLeave: 15,
        usedCasual: 0,
        usedSick: 0,
        usedAnnual: 0,
      },
    });
  } catch (error) {
    next(error);
  }
};
