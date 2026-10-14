import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../middleware/audit';

// Generate unique salary code: SAL-YYYY-MM-XXXX
const generateSalaryCode = async (periodMonth: string): Promise<string> => {
  const prefix = `SAL-${periodMonth}-`;
  const lastRecord = await prisma.salaryRecord.findFirst({
    where: { salaryCode: { startsWith: prefix } },
    orderBy: { salaryCode: 'desc' },
  });

  if (!lastRecord) {
    return `${prefix}0001`;
  }

  const parts = lastRecord.salaryCode.split('-');
  const seq = parseInt(parts[3] || '0', 10);
  return `${prefix}${(seq + 1).toString().padStart(4, '0')}`;
};

// Generate salary slip number: SLIP-YYYY-MM-XXXX
const generateSlipNumber = async (periodMonth: string): Promise<string> => {
  const prefix = `SLIP-${periodMonth}-`;
  const lastSlip = await prisma.salarySlip.findFirst({
    where: { slipNumber: { startsWith: prefix } },
    orderBy: { slipNumber: 'desc' },
  });

  if (!lastSlip) {
    return `${prefix}0001`;
  }

  const parts = lastSlip.slipNumber.split('-');
  const seq = parseInt(parts[3] || '0', 10);
  return `${prefix}${(seq + 1).toString().padStart(4, '0')}`;
};

export const getSalaries = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { periodMonth, status, labourerId, contractorId } = req.query;
    const where: any = {};

    // Scoping for roles
    if (req.user?.roles.includes('CONTRACTOR') && req.user.contractorId) {
      where.labourer = { contractorId: req.user.contractorId };
    } else if (contractorId) {
      where.labourer = { contractorId: contractorId as string };
    }

    if (req.user?.roles.includes('LABOURER') && req.user.labourerId) {
      where.labourerId = req.user.labourerId;
    } else if (labourerId) {
      where.labourerId = labourerId as string;
    }

    if (periodMonth) {
      where.periodMonth = periodMonth as string;
    }

    if (status) {
      where.status = status as string;
    }

    const records = await prisma.salaryRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        labourer: {
          select: {
            id: true,
            labourId: true,
            firstName: true,
            lastName: true,
            skills: true,
            dailyWageRate: true,
            contractor: { select: { companyName: true } },
          },
        },
        calculatedBy: { select: { firstName: true, lastName: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
        salarySlip: true,
        payments: true,
        components: true,
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

export const getSalaryById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const record = await prisma.salaryRecord.findUnique({
      where: { id },
      include: {
        labourer: {
          include: {
            contractor: true,
          },
        },
        calculatedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        components: true,
        salarySlip: true,
        payments: true,
      },
    });

    if (!record) {
      return next(new AppError('Salary record not found.', 404));
    }

    res.json({
      success: true,
      data: record,
    });
  } catch (error) {
    next(error);
  }
};

export const calculateSalary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      labourerId,
      periodMonth, // Format: YYYY-MM
      bonusAmount = 0,
      customDeductions = 0,
      notes,
    } = req.body;

    if (!labourerId || !periodMonth) {
      return next(new AppError('labourerId and periodMonth (YYYY-MM) are required.', 400));
    }

    // Determine period date range
    const [yearStr, monthStr] = periodMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // Check if salary already exists for this period
    const existing = await prisma.salaryRecord.findUnique({
      where: {
        labourerId_periodMonth: {
          labourerId,
          periodMonth,
        },
      },
    });

    if (existing && existing.status !== 'DRAFT') {
      return next(
        new AppError(
          `Salary for ${periodMonth} already processed and has status '${existing.status}'. Cannot recalculate without admin intervention.`,
          400
        )
      );
    }

    // Retrieve Labourer profile
    const labourer = await prisma.labourer.findUnique({
      where: { id: labourerId },
      include: {
        advances: {
          where: { recoveryStatus: { in: ['PENDING', 'PARTIAL'] } },
        },
        deductions: {
          where: { status: 'PENDING' },
        },
      },
    });

    if (!labourer) {
      return next(new AppError('Labourer not found.', 404));
    }

    // Retrieve approved attendance records for the period
    const attendances = await prisma.attendance.findMany({
      where: {
        labourerId,
        date: { gte: startDate, lte: endDate },
        isApproved: true,
      },
    });

    let totalDaysWorked = 0;
    let totalWorkingHours = 0;
    let totalOtHours = 0;

    for (const att of attendances) {
      if (att.status === 'PRESENT' || att.status === 'OVERTIME') {
        totalDaysWorked += 1;
      } else if (att.status === 'HALF_DAY') {
        totalDaysWorked += 0.5;
      } else if (att.status === 'PAID_LEAVE') {
        totalDaysWorked += 1;
      }

      totalWorkingHours += att.workingHours;
      totalOtHours += att.overtimeHours;
    }

    // Compute Base Wages
    const dailyRate = labourer.dailyWageRate;
    const baseWages = Math.round(totalDaysWorked * dailyRate * 100) / 100;

    // Compute Overtime Amount
    const hourlyOtRate = (dailyRate / 8) * 1.5;
    const overtimeAmount = Math.round(totalOtHours * hourlyOtRate * 100) / 100;

    // Compute Bonuses
    const bonus = parseFloat(bonusAmount) || 0.0;

    // Compute Deductions from pending deduction records + custom
    const pendingDeductionsSum = labourer.deductions.reduce((sum, d) => sum + d.amount, 0);
    const deductionsAmount = Math.round((pendingDeductionsSum + (parseFloat(customDeductions) || 0)) * 100) / 100;

    // Advances Recovery: Recover up to available net before advance
    let advancesRecovered = 0.0;
    const grossEarnings = baseWages + overtimeAmount + bonus;
    const maxRecoverable = Math.max(0, grossEarnings - deductionsAmount);

    for (const adv of labourer.advances) {
      if (advancesRecovered >= maxRecoverable) break;
      const canRecover = Math.min(adv.remainingAmount, maxRecoverable - advancesRecovered, adv.amount * 0.5); // standard recovery: up to 50% of original loan or remaining
      advancesRecovered += canRecover;
    }
    advancesRecovered = Math.round(advancesRecovered * 100) / 100;

    // Formula: Net Pay = Base Wages + Overtime + Bonuses − Deductions − Advances Recovered
    const netPay = Math.round((baseWages + overtimeAmount + bonus - deductionsAmount - advancesRecovered) * 100) / 100;

    // Execute atomic transaction for salary creation/update and itemized components
    const salaryRecord = await prisma.$transaction(async (tx) => {
      let record;
      if (existing) {
        // Delete previous draft components
        await tx.salaryComponent.deleteMany({ where: { salaryRecordId: existing.id } });

        record = await tx.salaryRecord.update({
          where: { id: existing.id },
          data: {
            startDate,
            endDate,
            baseWages,
            overtimeAmount,
            bonusAmount: bonus,
            deductionsAmount,
            advancesRecovered,
            netPay,
            status: 'CALCULATED',
            calculatedById: req.user?.id,
            notes,
          },
        });
      } else {
        const salaryCode = await generateSalaryCode(periodMonth);
        record = await tx.salaryRecord.create({
          data: {
            salaryCode,
            labourerId,
            periodMonth,
            startDate,
            endDate,
            baseWages,
            overtimeAmount,
            bonusAmount: bonus,
            deductionsAmount,
            advancesRecovered,
            netPay,
            status: 'CALCULATED',
            calculatedById: req.user?.id,
            notes,
          },
        });
      }

      // Create itemized salary components
      await tx.salaryComponent.createMany({
        data: [
          {
            salaryRecordId: record.id,
            type: 'EARNING',
            name: `Base Wages (${totalDaysWorked} Days)`,
            amount: baseWages,
            description: `₹${dailyRate} x ${totalDaysWorked} days worked`,
          },
          ...(overtimeAmount > 0
            ? [
                {
                  salaryRecordId: record.id,
                  type: 'EARNING',
                  name: `Overtime Pay (${totalOtHours} hrs)`,
                  amount: overtimeAmount,
                  description: `@ 1.5x hourly rate (₹${hourlyOtRate.toFixed(2)}/hr)`,
                },
              ]
            : []),
          ...(bonus > 0
            ? [
                {
                  salaryRecordId: record.id,
                  type: 'EARNING',
                  name: 'Performance / Special Bonus',
                  amount: bonus,
                  description: 'Approved incentive',
                },
              ]
            : []),
          ...(deductionsAmount > 0
            ? [
                {
                  salaryRecordId: record.id,
                  type: 'DEDUCTION',
                  name: 'Statutory / Other Deductions',
                  amount: deductionsAmount,
                  description: 'Insurance, welfare fund, or penalties',
                },
              ]
            : []),
          ...(advancesRecovered > 0
            ? [
                {
                  salaryRecordId: record.id,
                  type: 'DEDUCTION',
                  name: 'Advance Recovery Installment',
                  amount: advancesRecovered,
                  description: 'Deduction towards outstanding advance',
                },
              ]
            : []),
        ],
      });

      return record;
    });

    await logAudit(req, 'CALCULATE_SALARY', 'SALARY', salaryRecord.id, {
      labourerId,
      periodMonth,
      netPay,
      totalDaysWorked,
    });

    res.status(201).json({
      success: true,
      message: `Salary for ${periodMonth} calculated successfully. Net Pay: ₹${netPay}`,
      data: salaryRecord,
    });
  } catch (error) {
    next(error);
  }
};

export const approveSalary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { notes } = req.body;

    const salary = await prisma.salaryRecord.findUnique({
      where: { id },
      include: { labourer: true },
    });

    if (!salary) {
      return next(new AppError('Salary record not found.', 404));
    }

    if (salary.status === 'APPROVED' || salary.status === 'PAID') {
      return next(new AppError(`Salary record already in '${salary.status}' state.`, 400));
    }

    // Atomic transaction: update status, generate slip
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.salaryRecord.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: req.user?.id,
          approvalDate: new Date(),
          notes: notes || salary.notes,
        },
      });

      // Generate or update salary slip
      const slipNumber = await generateSlipNumber(salary.periodMonth);
      const grossPay = salary.baseWages + salary.overtimeAmount + salary.bonusAmount;
      const totalDeductions = salary.deductionsAmount + salary.advancesRecovered;

      const slip = await tx.salarySlip.upsert({
        where: { salaryRecordId: id },
        update: {
          grossPay,
          totalDeductions,
          netPay: salary.netPay,
        },
        create: {
          slipNumber,
          salaryRecordId: id,
          labourerId: salary.labourerId,
          generatedDate: new Date(),
          period: salary.periodMonth,
          grossPay,
          totalDeductions,
          netPay: salary.netPay,
        },
      });

      // Also create notification for the labourer
      await tx.notification.create({
        data: {
          userId: salary.labourer.userId || undefined,
          labourerId: salary.labourerId,
          title: 'Salary Approved',
          message: `Your wage of ₹${salary.netPay.toFixed(2)} for ${salary.periodMonth} has been approved by management.`,
          type: 'WAGE',
          link: `/salaries`,
        },
      });

      return { record: updated, slip };
    });

    await logAudit(req, 'APPROVE_SALARY', 'SALARY', id, {
      netPay: salary.netPay,
      approver: req.user?.id,
    });

    res.json({
      success: true,
      message: 'Salary record approved and salary slip generated successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getSalarySlip = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string; // salaryRecordId or slipId

    const slip = await prisma.salarySlip.findFirst({
      where: {
        OR: [{ id }, { salaryRecordId: id }],
      },
      include: {
        labourer: {
          include: {
            contractor: true,
          },
        },
        salaryRecord: {
          include: {
            components: true,
            payments: true,
            approvedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!slip) {
      return next(new AppError('Salary slip not found for the requested record.', 404));
    }

    res.json({
      success: true,
      data: slip,
    });
  } catch (error) {
    next(error);
  }
};

export const createLabourAdvance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { labourerId, amount, reason } = req.body;

    if (!labourerId || !amount) {
      return next(new AppError('labourerId and amount are required.', 400));
    }

    const advanceAmount = parseFloat(amount);
    if (advanceAmount <= 0) {
      return next(new AppError('Advance amount must be greater than zero.', 400));
    }

    const advance = await prisma.labourAdvance.create({
      data: {
        labourerId,
        amount: advanceAmount,
        requestDate: new Date(),
        disbursementDate: new Date(),
        recoveryStatus: 'PENDING',
        remainingAmount: advanceAmount,
        reason,
        approvedById: req.user?.id,
      },
    });

    await logAudit(req, 'CREATE_ADVANCE', 'SALARY', advance.id, { labourerId, amount: advanceAmount });

    res.status(201).json({
      success: true,
      message: 'Labour advance disbursed and recorded.',
      data: advance,
    });
  } catch (error) {
    next(error);
  }
};

export const getLabourAdvances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { labourerId, recoveryStatus } = req.query;
    const where: any = {};

    if (labourerId) where.labourerId = labourerId as string;
    if (recoveryStatus) where.recoveryStatus = recoveryStatus as string;

    const advances = await prisma.labourAdvance.findMany({
      where,
      orderBy: { requestDate: 'desc' },
      include: {
        labourer: {
          select: { id: true, labourId: true, firstName: true, lastName: true },
        },
      },
    });

    res.json({
      success: true,
      data: advances,
    });
  } catch (error) {
    next(error);
  }
};
