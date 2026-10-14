import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../middleware/audit';

// Helper to generate next unique Labour ID: LBR-YYYY-XXXX
const generateUniqueLabourId = async (): Promise<string> => {
  const currentYear = new Date().getFullYear();
  const prefix = `LBR-${currentYear}-`;

  const lastLabourer = await prisma.labourer.findFirst({
    where: {
      labourId: {
        startsWith: prefix,
      },
    },
    orderBy: {
      labourId: 'desc',
    },
  });

  if (!lastLabourer) {
    return `${prefix}0001`;
  }

  const parts = lastLabourer.labourId.split('-');
  const seqNum = parseInt(parts[2] || '0', 10);
  const nextSeq = (seqNum + 1).toString().padStart(4, '0');
  return `${prefix}${nextSeq}`;
};

export const getLabourers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const skip = (page - 1) * limit;

    const { search, status, contractorId, skills, sortBy, sortOrder } = req.query;

    const where: any = {};

    // Role-specific scoping: Contractors only see their assigned labourers
    if (req.user?.roles.includes('CONTRACTOR') && req.user.contractorId) {
      where.contractorId = req.user.contractorId;
    } else if (contractorId) {
      where.contractorId = contractorId as string;
    }

    if (status) {
      where.status = status as string;
    }

    if (skills) {
      where.skills = { contains: skills as string };
    }

    if (search) {
      const s = (search as string).trim();
      where.OR = [
        { labourId: { contains: s } },
        { firstName: { contains: s } },
        { lastName: { contains: s } },
        { phone: { contains: s } },
        { skills: { contains: s } },
      ];
    }

    const orderByField = (sortBy as string) || 'createdAt';
    const orderDirection = ((sortOrder as string)?.toLowerCase() === 'asc' ? 'asc' : 'desc');

    const [total, labourers] = await Promise.all([
      prisma.labourer.count({ where }),
      prisma.labourer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderByField]: orderDirection },
        include: {
          contractor: {
            select: { id: true, companyName: true, contactPerson: true },
          },
          projectAssignments: {
            where: { status: 'ACTIVE' },
            include: {
              project: {
                select: { id: true, projectCode: true, name: true },
              },
            },
          },
          leaveBalances: {
            where: { year: new Date().getFullYear() },
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: labourers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLabourerById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const labourer = await prisma.labourer.findUnique({
      where: { id },
      include: {
        contractor: true,
        projectAssignments: {
          include: { project: true },
        },
        attendances: {
          take: 30,
          orderBy: { date: 'desc' },
          include: { project: { select: { name: true } } },
        },
        salaryRecords: {
          take: 6,
          orderBy: { createdAt: 'desc' },
          include: { salarySlip: true, payments: true },
        },
        leaveRequests: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        leaveBalances: {
          where: { year: new Date().getFullYear() },
        },
        documents: true,
        advances: {
          orderBy: { requestDate: 'desc' },
        },
      },
    });

    if (!labourer) {
      return next(new AppError('Labourer not found.', 404));
    }

    res.json({
      success: true,
      data: labourer,
    });
  } catch (error) {
    next(error);
  }
};

export const createLabourer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      emergencyContact,
      address,
      city,
      state,
      postalCode,
      dateOfBirth,
      gender,
      skills,
      dailyWageRate,
      employmentType,
      contractorId,
      photoUrl,
    } = req.body;

    if (!firstName || !lastName || !phone) {
      return next(new AppError('First name, last name, and phone are required.', 400));
    }

    const labourId = await generateUniqueLabourId();

    const wage = parseFloat(dailyWageRate) || 500.0;

    const labourer = await prisma.$transaction(async (tx) => {
      const created = await tx.labourer.create({
        data: {
          labourId,
          firstName,
          lastName,
          phone,
          emergencyContact,
          address,
          city,
          state,
          postalCode,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          gender: gender || 'MALE',
          skills,
          dailyWageRate: wage,
          employmentType: employmentType || 'DAILY_WAGE',
          contractorId: contractorId || null,
          photoUrl: photoUrl || null,
          status: 'ACTIVE',
        },
      });

      // Default wage rate record
      await tx.wageRate.create({
        data: {
          labourerId: created.id,
          rateType: 'DAILY',
          baseRate: wage,
          overtimeHourlyRate: (wage / 8) * 1.5,
          currency: 'INR',
        },
      });

      // Current year leave balance
      await tx.leaveBalance.create({
        data: {
          labourerId: created.id,
          year: new Date().getFullYear(),
          casualLeave: 12,
          sickLeave: 10,
          annualLeave: 15,
        },
      });

      return created;
    });

    await logAudit(req, 'CREATE', 'LABOURER', labourer.id, { labourId, name: `${firstName} ${lastName}` });

    res.status(201).json({
      success: true,
      message: 'Labourer registered successfully.',
      data: labourer,
    });
  } catch (error) {
    next(error);
  }
};

export const updateLabourer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const updateData = { ...req.body };

    // Prevent direct manual alteration of unique labourId
    delete updateData.labourId;
    delete updateData.id;

    if (updateData.dateOfBirth) {
      updateData.dateOfBirth = new Date(updateData.dateOfBirth);
    }
    if (updateData.dailyWageRate) {
      updateData.dailyWageRate = parseFloat(updateData.dailyWageRate);
    }

    const updated = await prisma.labourer.update({
      where: { id },
      data: updateData,
    });

    await logAudit(req, 'UPDATE', 'LABOURER', id, updateData);

    res.json({
      success: true,
      message: 'Labourer profile updated successfully.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const updateLabourerStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    if (!['ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE'].includes(status)) {
      return next(new AppError('Invalid status value.', 400));
    }

    const updated = await prisma.labourer.update({
      where: { id },
      data: { status },
    });

    await logAudit(req, 'UPDATE_STATUS', 'LABOURER', id, { newStatus: status });

    res.json({
      success: true,
      message: `Labourer status updated to ${status}.`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const uploadLabourerDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { title, documentType } = req.body;
    const file = req.file;

    if (!file) {
      return next(new AppError('No document uploaded.', 400));
    }

    const doc = await prisma.document.create({
      data: {
        labourerId: id,
        title: title || file.originalname,
        documentType: documentType || 'ID_PROOF',
        fileUrl: `/uploads/${file.filename}`,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById: req.user?.id,
      },
    });

    await logAudit(req, 'UPLOAD_DOC', 'LABOURER', id, { documentId: doc.id, fileName: file.originalname });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully.',
      data: doc,
    });
  } catch (error) {
    next(error);
  }
};
