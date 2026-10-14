import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../middleware/audit';

// Generate transaction ref: TXN-YYYYMMDD-XXXX
const generateTransactionRef = (): string => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TXN-${dateStr}-${rand}`;
};

export const createPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      salaryRecordId,
      amount,
      paymentMethod,
      transactionRef: userRef,
      remarks,
    } = req.body;

    if (!salaryRecordId || !amount) {
      return next(new AppError('salaryRecordId and amount are required.', 400));
    }

    const payAmount = parseFloat(amount);
    if (payAmount <= 0) {
      return next(new AppError('Payment amount must be greater than zero.', 400));
    }

    const txnRef = userRef || generateTransactionRef();

    // DUPLICATE PAYMENT PREVENTION: Check if transaction reference is already recorded
    const duplicateTxn = await prisma.paymentTransaction.findUnique({
      where: { transactionRef: txnRef },
    });

    if (duplicateTxn) {
      return next(
        new AppError(
          `Duplicate transaction reference detected (${txnRef}). Transaction has already been recorded.`,
          409
        )
      );
    }

    // Retrieve salary record
    const salary = await prisma.salaryRecord.findUnique({
      where: { id: salaryRecordId },
      include: {
        payments: true,
        labourer: {
          include: {
            advances: {
              where: { recoveryStatus: { in: ['PENDING', 'PARTIAL'] } },
            },
          },
        },
      },
    });

    if (!salary) {
      return next(new AppError('Salary record not found.', 404));
    }

    // Require authorization: Salary must be in APPROVED or PARTIALLY_PAID status
    if (salary.status !== 'APPROVED' && salary.status !== 'PARTIALLY_PAID') {
      return next(
        new AppError(
          `Cannot process payment. Salary record is in '${salary.status}' status. It must be approved first.`,
          400
        )
      );
    }

    // Calculate existing completed payments for this salary record
    const alreadyPaid = salary.payments
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.amount, 0);

    const remainingDue = Math.round((salary.netPay - alreadyPaid) * 100) / 100;

    if (payAmount > remainingDue + 0.01) {
      return next(
        new AppError(
          `Payment amount (₹${payAmount}) exceeds remaining due balance (₹${remainingDue}).`,
          400
        )
      );
    }


    // Execute atomic transaction for payment and status update
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Payment Transaction
      const transaction = await tx.paymentTransaction.create({
        data: {
          transactionRef: txnRef,
          salaryRecordId,
          labourerId: salary.labourerId,
          amount: payAmount,
          paymentMethod: paymentMethod || 'BANK_TRANSFER',
          paymentDate: new Date(),
          status: 'COMPLETED',
          paidById: req.user?.id,
          remarks: remarks || `Disbursement for period ${salary.periodMonth}`,
        },
      });

      // 2. Update Salary Record Status
      const newTotalPaid = alreadyPaid + payAmount;
      const newStatus = newTotalPaid >= salary.netPay - 0.01 ? 'PAID' : 'PARTIALLY_PAID';

      await tx.salaryRecord.update({
        where: { id: salaryRecordId },
        data: { status: newStatus },
      });

      // 3. If advance recovery was part of this salary and it is now paid, mark advance recovery in DB
      if (salary.advancesRecovered > 0 && newStatus === 'PAID') {
        let toRecover = salary.advancesRecovered;
        for (const adv of salary.labourer.advances) {
          if (toRecover <= 0) break;
          const recThis = Math.min(adv.remainingAmount, toRecover);
          const newRemaining = adv.remainingAmount - recThis;
          const recStatus = newRemaining <= 0.01 ? 'RECOVERED' : 'PARTIAL';

          await tx.labourAdvance.update({
            where: { id: adv.id },
            data: {
              recoveredAmount: adv.recoveredAmount + recThis,
              remainingAmount: Math.max(0, newRemaining),
              recoveryStatus: recStatus,
            },
          });
          toRecover -= recThis;
        }
      }

      // 4. In-App Notification
      await tx.notification.create({
        data: {
          userId: salary.labourer.userId || undefined,
          labourerId: salary.labourerId,
          title: 'Payment Disbursed',
          message: `Payment of ₹${payAmount.toFixed(2)} via ${paymentMethod || 'Bank Transfer'} has been completed. Ref: ${txnRef}`,
          type: 'PAYMENT',
          link: '/salaries',
        },
      });

      return { transaction, newStatus, remainingDue: Math.max(0, salary.netPay - newTotalPaid) };
    });

    await logAudit(req, 'PAYMENT', 'SALARY', result.transaction.id, {
      salaryRecordId,
      amount: payAmount,
      transactionRef: txnRef,
      paymentMethod,
    });

    res.status(201).json({
      success: true,
      message: `Payment of ₹${payAmount} completed successfully. Salary status: ${result.newStatus}.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getPaymentHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { labourerId, salaryRecordId, paymentMethod, status } = req.query;
    const where: any = {};

    if (req.user?.roles.includes('LABOURER') && req.user.labourerId) {
      where.labourerId = req.user.labourerId;
    } else if (labourerId) {
      where.labourerId = labourerId as string;
    }

    if (salaryRecordId) where.salaryRecordId = salaryRecordId as string;
    if (paymentMethod) where.paymentMethod = paymentMethod as string;
    if (status) where.status = status as string;

    const payments = await prisma.paymentTransaction.findMany({
      where,
      orderBy: { paymentDate: 'desc' },
      include: {
        labourer: {
          select: { id: true, labourId: true, firstName: true, lastName: true },
        },
        salaryRecord: {
          select: { salaryCode: true, periodMonth: true, netPay: true },
        },
        paidBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    res.json({
      success: true,
      data: payments,
    });
  } catch (error) {
    next(error);
  }
};
