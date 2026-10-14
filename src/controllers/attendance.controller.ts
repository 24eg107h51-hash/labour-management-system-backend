import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../middleware/audit';

// Normalize date to midnight UTC to ensure uniqueness per day
const normalizeDate = (dateStr?: string | Date): Date => {
  const d = dateStr ? new Date(dateStr) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
};

export const getAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date, startDate, endDate, projectId, labourerId, status, isApproved } = req.query;

    const where: any = {};

    // Contractors only see their labourers' attendance
    if (req.user?.roles.includes('CONTRACTOR') && req.user.contractorId) {
      where.labourer = { contractorId: req.user.contractorId };
    }

    // Labourers only see their own attendance
    if (req.user?.roles.includes('LABOURER') && req.user.labourerId) {
      where.labourerId = req.user.labourerId;
    } else if (labourerId) {
      where.labourerId = labourerId as string;
    }

    if (date) {
      where.date = normalizeDate(date as string);
    } else if (startDate && endDate) {
      where.date = {
        gte: normalizeDate(startDate as string),
        lte: normalizeDate(endDate as string),
      };
    }

    if (projectId) {
      where.projectId = projectId as string;
    }

    if (status) {
      where.status = status as string;
    }

    if (isApproved !== undefined) {
      where.isApproved = isApproved === 'true';
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        labourer: {
          select: {
            id: true,
            labourId: true,
            firstName: true,
            lastName: true,
            dailyWageRate: true,
            skills: true,
            contractor: { select: { companyName: true } },
          },
        },
        project: {
          select: { id: true, projectCode: true, name: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    res.json({
      success: true,
      data: records,
    });
  } catch (error) {
    next(error);
  }
};

export const recordAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      labourerId,
      projectId,
      date,
      status,
      workingHours,
      overtimeHours,
      checkInTime,
      checkOutTime,
      remarks,
    } = req.body;

    if (!labourerId) {
      return next(new AppError('labourerId is required.', 400));
    }

    const attendanceDate = normalizeDate(date);
    const attStatus = status || 'PRESENT';
    const hrs = parseFloat(workingHours) || (attStatus === 'HALF_DAY' ? 4.0 : attStatus === 'ABSENT' ? 0.0 : 8.0);
    const otHrs = parseFloat(overtimeHours) || 0.0;

    // Duplicate Prevention Check:
    const existing = await prisma.attendance.findUnique({
      where: {
        labourerId_date: {
          labourerId,
          date: attendanceDate,
        },
      },
    });

    if (existing) {
      return next(
        new AppError(
          `Attendance record already exists for this labourer on ${attendanceDate.toISOString().split('T')[0]}. Use update instead.`,
          409
        )
      );
    }

    const attendance = await prisma.$transaction(async (tx) => {
      const created = await tx.attendance.create({
        data: {
          labourerId,
          projectId: projectId || null,
          date: attendanceDate,
          status: attStatus,
          workingHours: hrs,
          overtimeHours: otHrs,
          checkInTime: checkInTime ? new Date(checkInTime) : null,
          checkOutTime: checkOutTime ? new Date(checkOutTime) : null,
          remarks: remarks || null,
          isApproved: false, // Requires supervisor sign-off
        },
      });

      // If overtime recorded, also create pending overtime record
      if (otHrs > 0) {
        const lab = await tx.labourer.findUnique({ where: { id: labourerId } });
        const hourlyRate = ((lab?.dailyWageRate || 500) / 8) * 1.5;
        await tx.overtimeRecord.create({
          data: {
            labourerId,
            projectId: projectId || null,
            date: attendanceDate,
            overtimeHours: otHrs,
            hourlyRate,
            calculatedAmount: otHrs * hourlyRate,
            status: 'PENDING',
            notes: remarks || 'Recorded via daily attendance',
          },
        });
      }

      return created;
    });

    await logAudit(req, 'CREATE', 'ATTENDANCE', attendance.id, {
      labourerId,
      date: attendanceDate,
      status: attStatus,
    });

    res.status(201).json({
      success: true,
      message: 'Attendance recorded successfully.',
      data: attendance,
    });
  } catch (error) {
    next(error);
  }
};

export const bulkRecordAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date, records, projectId } = req.body;
    // records: Array<{ labourerId: string, status: string, workingHours: number, overtimeHours: number, remarks?: string }>

    if (!records || !Array.isArray(records) || records.length === 0) {
      return next(new AppError('An array of attendance records is required.', 400));
    }

    const attDate = normalizeDate(date);
    const results = [];
    const skipped = [];

    for (const r of records) {
      const existing = await prisma.attendance.findUnique({
        where: {
          labourerId_date: {
            labourerId: r.labourerId,
            date: attDate,
          },
        },
      });

      if (existing) {
        skipped.push(r.labourerId);
        continue;
      }

      const status = r.status || 'PRESENT';
      const hours = parseFloat(r.workingHours) || (status === 'HALF_DAY' ? 4.0 : status === 'ABSENT' ? 0.0 : 8.0);
      const ot = parseFloat(r.overtimeHours) || 0.0;

      const created = await prisma.attendance.create({
        data: {
          labourerId: r.labourerId,
          projectId: r.projectId || projectId || null,
          date: attDate,
          status,
          workingHours: hours,
          overtimeHours: ot,
          remarks: r.remarks || null,
          isApproved: false,
        },
      });
      results.push(created);
    }

    await logAudit(req, 'BULK_RECORD', 'ATTENDANCE', undefined, {
      date: attDate,
      recordedCount: results.length,
      skippedCount: skipped.length,
    });

    res.status(201).json({
      success: true,
      message: `Bulk attendance processed: ${results.length} recorded, ${skipped.length} duplicate/skipped.`,
      data: {
        recorded: results,
        skippedLabourerIds: skipped,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { status, workingHours, overtimeHours, remarks, isApproved, approvalNotes } = req.body;

    const current = await prisma.attendance.findUnique({ where: { id } });
    if (!current) {
      return next(new AppError('Attendance record not found.', 404));
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (workingHours !== undefined) updateData.workingHours = parseFloat(workingHours);
    if (overtimeHours !== undefined) updateData.overtimeHours = parseFloat(overtimeHours);
    if (remarks !== undefined) updateData.remarks = remarks;
    if (isApproved !== undefined) {
      updateData.isApproved = isApproved;
      if (isApproved) {
        updateData.approvedById = req.user?.id;
        updateData.approvalNotes = approvalNotes || 'Approved by Supervisor';
      }
    }

    const updated = await prisma.attendance.update({
      where: { id },
      data: updateData,
    });

    // Record audit trail of attendance edit
    await logAudit(req, 'UPDATE', 'ATTENDANCE', id, {
      before: { status: current.status, workingHours: current.workingHours, overtimeHours: current.overtimeHours },
      after: updateData,
    });

    res.json({
      success: true,
      message: 'Attendance record updated successfully with audit trail.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const approveAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attendanceIds, approvalNotes } = req.body;

    if (!attendanceIds || !Array.isArray(attendanceIds) || attendanceIds.length === 0) {
      return next(new AppError('Array of attendanceIds is required.', 400));
    }

    const count = await prisma.attendance.updateMany({
      where: {
        id: { in: attendanceIds },
      },
      data: {
        isApproved: true,
        approvedById: req.user?.id,
        approvalNotes: approvalNotes || 'Supervisor sign-off completed',
      },
    });

    await logAudit(req, 'APPROVE', 'ATTENDANCE', undefined, { count: count.count, attendanceIds });

    res.json({
      success: true,
      message: `Successfully approved ${count.count} attendance records.`,
      data: count,
    });
  } catch (error) {
    next(error);
  }
};

export const getAttendanceSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = req.query.date ? normalizeDate(req.query.date as string) : normalizeDate();

    const [totalLabourers, recordsToday] = await Promise.all([
      prisma.labourer.count({ where: { status: 'ACTIVE' } }),
      prisma.attendance.findMany({
        where: { date },
      }),
    ]);

    const present = recordsToday.filter((r) => r.status === 'PRESENT' || r.status === 'OVERTIME').length;
    const halfDay = recordsToday.filter((r) => r.status === 'HALF_DAY').length;
    const onLeave = recordsToday.filter((r) => r.status === 'PAID_LEAVE').length;
    const markedAbsent = recordsToday.filter((r) => r.status === 'ABSENT').length;
    const unrecorded = Math.max(0, totalLabourers - recordsToday.length);
    const absent = markedAbsent + unrecorded;

    res.json({
      success: true,
      data: {
        date: date.toISOString().split('T')[0],
        totalActiveLabourers: totalLabourers,
        present,
        absent,
        halfDay,
        onLeave,
        unrecorded,
        attendanceRate: totalLabourers > 0 ? Math.round(((present + halfDay * 0.5) / totalLabourers) * 100) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
};
