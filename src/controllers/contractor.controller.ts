import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../middleware/audit';

export const getContractors = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, search } = req.query;
    const where: any = {};

    if (status) {
      where.status = status as string;
    }

    if (search) {
      const s = (search as string).trim();
      where.OR = [
        { companyName: { contains: s } },
        { contactPerson: { contains: s } },
        { email: { contains: s } },
        { phone: { contains: s } },
      ];
    }

    const contractors = await prisma.contractor.findMany({
      where,
      orderBy: { companyName: 'asc' },
      include: {
        _count: {
          select: { labourers: true, projectAssignments: true },
        },
      },
    });

    res.json({
      success: true,
      data: contractors,
    });
  } catch (error) {
    next(error);
  }
};

export const getContractorById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const contractor = await prisma.contractor.findUnique({
      where: { id },
      include: {
        labourers: {
          select: {
            id: true,
            labourId: true,
            firstName: true,
            lastName: true,
            phone: true,
            skills: true,
            dailyWageRate: true,
            status: true,
          },
        },
        projectAssignments: {
          include: {
            project: true,
            labourer: { select: { firstName: true, lastName: true, labourId: true } },
          },
        },
        documents: true,
      },
    });

    if (!contractor) {
      return next(new AppError('Contractor not found.', 404));
    }

    res.json({
      success: true,
      data: contractor,
    });
  } catch (error) {
    next(error);
  }
};

export const createContractor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      companyName,
      contactPerson,
      email,
      phone,
      address,
      taxId,
      licenseNumber,
      contractStartDate,
      contractEndDate,
      notes,
    } = req.body;

    if (!companyName || !contactPerson || !email || !phone) {
      return next(new AppError('Company name, contact person, email, and phone are required.', 400));
    }

    const contractor = await prisma.contractor.create({
      data: {
        companyName,
        contactPerson,
        email: email.toLowerCase(),
        phone,
        address,
        taxId,
        licenseNumber,
        contractStartDate: contractStartDate ? new Date(contractStartDate) : null,
        contractEndDate: contractEndDate ? new Date(contractEndDate) : null,
        notes,
        status: 'ACTIVE',
      },
    });

    await logAudit(req, 'CREATE', 'CONTRACTOR', contractor.id, { companyName });

    res.status(201).json({
      success: true,
      message: 'Contractor registered successfully.',
      data: contractor,
    });
  } catch (error) {
    next(error);
  }
};

export const updateContractor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const updateData = { ...req.body };

    if (updateData.contractStartDate) {
      updateData.contractStartDate = new Date(updateData.contractStartDate);
    }
    if (updateData.contractEndDate) {
      updateData.contractEndDate = new Date(updateData.contractEndDate);
    }

    const updated = await prisma.contractor.update({
      where: { id },
      data: updateData,
    });

    await logAudit(req, 'UPDATE', 'CONTRACTOR', id, updateData);

    res.json({
      success: true,
      message: 'Contractor updated successfully.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const getContractorStatement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { periodMonth } = req.query; // e.g. 2026-10

    const contractor = await prisma.contractor.findUnique({
      where: { id },
      include: {
        labourers: {
          include: {
            salaryRecords: {
              where: periodMonth ? { periodMonth: periodMonth as string } : undefined,
              include: { payments: true },
            },
            attendances: {
              where: {
                isApproved: true,
              },
              take: 31,
            },
          },
        },
      },
    });

    if (!contractor) {
      return next(new AppError('Contractor not found.', 404));
    }

    let totalLabourers = contractor.labourers.length;
    let totalWagesCalculated = 0;
    let totalWagesPaid = 0;
    let totalPending = 0;

    const breakdown = contractor.labourers.map((lab) => {
      const records = lab.salaryRecords;
      const labCalculated = records.reduce((sum, r) => sum + r.netPay, 0);
      const labPaid = records.reduce(
        (sum, r) => sum + r.payments.reduce((pSum, p) => pSum + (p.status === 'COMPLETED' ? p.amount : 0), 0),
        0
      );

      totalWagesCalculated += labCalculated;
      totalWagesPaid += labPaid;
      totalPending += Math.max(0, labCalculated - labPaid);

      return {
        labourerId: lab.id,
        labourCode: lab.labourId,
        name: `${lab.firstName} ${lab.lastName}`,
        skills: lab.skills,
        dailyRate: lab.dailyWageRate,
        totalNetPay: labCalculated,
        totalPaid: labPaid,
        pendingAmount: Math.max(0, labCalculated - labPaid),
      };
    });

    res.json({
      success: true,
      data: {
        contractor: {
          id: contractor.id,
          companyName: contractor.companyName,
          contactPerson: contractor.contactPerson,
          email: contractor.email,
          phone: contractor.phone,
          taxId: contractor.taxId,
        },
        period: periodMonth || 'All Periods',
        summary: {
          totalLabourers,
          totalWagesCalculated,
          totalWagesPaid,
          totalPending,
        },
        breakdown,
      },
    });
  } catch (error) {
    next(error);
  }
};
