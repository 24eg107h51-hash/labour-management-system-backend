import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive database seed for LMS...');

  // 1. Roles
  const rolesData = [
    { name: 'ADMIN', description: 'System Administrator with full access to all modules and configurations' },
    { name: 'SUPERVISOR', description: 'Site Supervisor / Manager managing daily attendance, tasks, and labourers' },
    { name: 'CONTRACTOR', description: 'Contractor overseeing supplied workforce, project progress, and wage claims' },
    { name: 'LABOURER', description: 'Field labourer viewing attendance, wages, work allocations, and leave requests' },
  ];

  const roles: Record<string, any> = {};
  for (const r of rolesData) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: {},
      create: r,
    });
    roles[r.name] = role;
  }
  console.log('✅ Roles seeded:', Object.keys(roles));

  // 2. Permissions
  const modules = ['LABOURERS', 'ATTENDANCE', 'PROJECTS', 'SALARIES', 'PAYMENTS', 'REPORTS', 'SETTINGS'];
  const actions = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE'];

  // Admin gets all permissions
  for (const mod of modules) {
    for (const act of actions) {
      await prisma.permission.create({
        data: {
          roleId: roles['ADMIN'].id,
          module: mod,
          action: act,
        },
      });
    }
  }

  // Supervisor permissions
  for (const mod of ['LABOURERS', 'ATTENDANCE', 'PROJECTS', 'REPORTS']) {
    for (const act of ['CREATE', 'READ', 'UPDATE', 'APPROVE']) {
      await prisma.permission.create({
        data: {
          roleId: roles['SUPERVISOR'].id,
          module: mod,
          action: act,
        },
      });
    }
  }

  // 3. Passwords & Users
  const salt = await bcrypt.genSalt(10);
  const adminHash = await bcrypt.hash('Admin@123', salt);
  const supervisorHash = await bcrypt.hash('Supervisor@123', salt);
  const contractorHash = await bcrypt.hash('Contractor@123', salt);
  const labourerHash = await bcrypt.hash('Labourer@123', salt);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@lms.com' },
    update: {},
    create: {
      email: 'admin@lms.com',
      passwordHash: adminHash,
      firstName: 'Vikram',
      lastName: 'Aditya',
      phone: '+91 98765 43210',
      status: 'ACTIVE',
      avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
      userRoles: {
        create: { roleId: roles['ADMIN'].id },
      },
    },
  });

  const supervisorUser = await prisma.user.upsert({
    where: { email: 'supervisor@lms.com' },
    update: {},
    create: {
      email: 'supervisor@lms.com',
      passwordHash: supervisorHash,
      firstName: 'Rajesh',
      lastName: 'Sharma',
      phone: '+91 98765 43211',
      status: 'ACTIVE',
      avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150',
      userRoles: {
        create: { roleId: roles['SUPERVISOR'].id },
      },
    },
  });

  const contractorUser = await prisma.user.upsert({
    where: { email: 'contractor@lms.com' },
    update: {},
    create: {
      email: 'contractor@lms.com',
      passwordHash: contractorHash,
      firstName: 'Manoj',
      lastName: 'Verma',
      phone: '+91 98765 43212',
      status: 'ACTIVE',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      userRoles: {
        create: { roleId: roles['CONTRACTOR'].id },
      },
    },
  });

  const labourerUser = await prisma.user.upsert({
    where: { email: 'labourer@lms.com' },
    update: {},
    create: {
      email: 'labourer@lms.com',
      passwordHash: labourerHash,
      firstName: 'Ramesh',
      lastName: 'Kumar',
      phone: '+91 98765 43213',
      status: 'ACTIVE',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      userRoles: {
        create: { roleId: roles['LABOURER'].id },
      },
    },
  });

  console.log('✅ Users seeded: admin@lms.com, supervisor@lms.com, contractor@lms.com, labourer@lms.com');

  // 4. Contractors
  const contractor1 = await prisma.contractor.create({
    data: {
      userId: contractorUser.id,
      companyName: 'Apex Manpower & Infra Solutions',
      contactPerson: 'Manoj Verma',
      email: 'contractor@lms.com',
      phone: '+91 98765 43212',
      address: 'Plot 45, Industrial Area Phase II, Bengaluru',
      taxId: 'GSTIN29AABCU9603R1ZM',
      licenseNumber: 'LIC-KA-2024-8841',
      contractStartDate: new Date('2026-01-01'),
      contractEndDate: new Date('2026-12-31'),
      status: 'ACTIVE',
      notes: 'Premier masonry and structural steel specialist contractor',
    },
  });

  const contractor2 = await prisma.contractor.create({
    data: {
      companyName: 'BuildCraft MEP Works',
      contactPerson: 'Suresh Patil',
      email: 'suresh@buildcraftmep.com',
      phone: '+91 98765 43215',
      address: 'Suite 201, Metro Tech Park, Hyderabad',
      taxId: 'GSTIN36AABCS4451Q1ZT',
      licenseNumber: 'LIC-TS-2025-4120',
      contractStartDate: new Date('2026-02-01'),
      contractEndDate: new Date('2026-11-30'),
      status: 'ACTIVE',
      notes: 'Electrical wiring, HVAC piping, and plumbing infrastructure provider',
    },
  });

  // 5. Projects
  const project1 = await prisma.project.create({
    data: {
      projectCode: 'PRJ-2026-001',
      name: 'Metro City Commercial Tower',
      description: 'G+22 Floor Premium IT Park and Commercial Center with multi-level basement',
      clientName: 'Prestige Group Realty',
      location: 'Outer Ring Road, Bengaluru',
      startDate: new Date('2026-01-10'),
      endDate: new Date('2027-06-30'),
      estimatedBudget: 45000000.0,
      status: 'ACTIVE',
      managerId: supervisorUser.id,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      projectCode: 'PRJ-2026-002',
      name: 'Sunrise Residential Heights - Phase 2',
      description: 'Luxury residential condominium consisting of 4 high-rise towers',
      clientName: 'Sunrise Builders Corp',
      location: 'Whitefield, Bengaluru',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2027-12-15'),
      estimatedBudget: 32000000.0,
      status: 'ACTIVE',
      managerId: supervisorUser.id,
    },
  });

  const project3 = await prisma.project.create({
    data: {
      projectCode: 'PRJ-2026-003',
      name: 'Greenfield Industrial Warehouse & Logistics Hub',
      description: 'Heavy duty steel frame warehouse facility with loading docks and cold storage',
      clientName: 'Ascendas Logistics Pvt Ltd',
      location: 'Hosur Road, Attibele',
      startDate: new Date('2026-05-15'),
      endDate: new Date('2026-11-30'),
      estimatedBudget: 18000000.0,
      status: 'PLANNING',
      managerId: adminUser.id,
    },
  });

  console.log('✅ Projects & Contractors seeded');

  // 6. Labourers
  const labourersData = [
    {
      labourId: 'LBR-2026-0001',
      userId: labourerUser.id,
      contractorId: contractor1.id,
      firstName: 'Ramesh',
      lastName: 'Kumar',
      phone: '+91 98765 43213',
      emergencyContact: 'Sita Kumar (+91 98765 43299)',
      address: 'H.No 12-4, Labour Colony, Peenya',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560058',
      dateOfBirth: new Date('1988-06-15'),
      gender: 'MALE',
      joiningDate: new Date('2026-01-15'),
      skills: 'Lead Mason, Brickwork, Plastering',
      dailyWageRate: 850.0,
      employmentType: 'CONTRACT',
      status: 'ACTIVE',
      photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    },
    {
      labourId: 'LBR-2026-0002',
      contractorId: contractor1.id,
      firstName: 'Santosh',
      lastName: 'Yadav',
      phone: '+91 98765 43221',
      emergencyContact: 'Sunita Yadav (+91 98765 43281)',
      address: 'Room 5, Shanti Nagar, Bommanahalli',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560068',
      dateOfBirth: new Date('1992-04-10'),
      gender: 'MALE',
      joiningDate: new Date('2026-01-15'),
      skills: 'Steel Fixer, Rebar Bending, Scaffolding',
      dailyWageRate: 800.0,
      employmentType: 'CONTRACT',
      status: 'ACTIVE',
      photoUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150',
    },
    {
      labourId: 'LBR-2026-0003',
      contractorId: contractor1.id,
      firstName: 'Dinesh',
      lastName: 'Chauhan',
      phone: '+91 98765 43222',
      emergencyContact: 'Anita Chauhan (+91 98765 43282)',
      address: '22/B, Kengeri Satellite Town',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560060',
      dateOfBirth: new Date('1995-09-20'),
      gender: 'MALE',
      joiningDate: new Date('2026-01-20'),
      skills: 'Carpentry, Formwork, Shuttering',
      dailyWageRate: 750.0,
      employmentType: 'DAILY_WAGE',
      status: 'ACTIVE',
      photoUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150',
    },
    {
      labourId: 'LBR-2026-0004',
      contractorId: contractor2.id,
      firstName: 'Amit',
      lastName: 'Singhania',
      phone: '+91 98765 43223',
      emergencyContact: 'Kavita Singhania (+91 98765 43283)',
      address: '14, Electronic City Phase 1',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560100',
      dateOfBirth: new Date('1990-11-05'),
      gender: 'MALE',
      joiningDate: new Date('2026-02-01'),
      skills: 'Electrician, Cable Laying, DB Dressing',
      dailyWageRate: 900.0,
      employmentType: 'FULL_TIME',
      status: 'ACTIVE',
      photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    },
    {
      labourId: 'LBR-2026-0005',
      contractorId: contractor2.id,
      firstName: 'Manju',
      lastName: 'Devi',
      phone: '+91 98765 43224',
      emergencyContact: 'Gopal (+91 98765 43284)',
      address: '109, Marathahalli Village',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560037',
      dateOfBirth: new Date('1994-03-12'),
      gender: 'FEMALE',
      joiningDate: new Date('2026-02-05'),
      skills: 'General Helper, Curing, Material Handling',
      dailyWageRate: 600.0,
      employmentType: 'DAILY_WAGE',
      status: 'ACTIVE',
      photoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
    },
    {
      labourId: 'LBR-2026-0006',
      contractorId: contractor1.id,
      firstName: 'Pradeep',
      lastName: 'Nath',
      phone: '+91 98765 43225',
      emergencyContact: 'Mamata Nath (+91 98765 43285)',
      address: '55, Begur Road, Hongasandra',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560068',
      dateOfBirth: new Date('1991-08-18'),
      gender: 'MALE',
      joiningDate: new Date('2026-02-10'),
      skills: 'Welder, Structural Fabrication, Arc Welding',
      dailyWageRate: 850.0,
      employmentType: 'CONTRACT',
      status: 'ACTIVE',
      photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    },
    {
      labourId: 'LBR-2026-0007',
      contractorId: contractor2.id,
      firstName: 'Sanjay',
      lastName: 'Gupta',
      phone: '+91 98765 43226',
      emergencyContact: 'Pooja Gupta (+91 98765 43286)',
      address: '88, Sarjapur Main Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560035',
      dateOfBirth: new Date('1987-12-30'),
      gender: 'MALE',
      joiningDate: new Date('2026-02-15'),
      skills: 'Plumbing, Sanitary Fixtures, CPVC Piping',
      dailyWageRate: 800.0,
      employmentType: 'FULL_TIME',
      status: 'ACTIVE',
      photoUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    },
    {
      labourId: 'LBR-2026-0008',
      contractorId: contractor1.id,
      firstName: 'Sunil',
      lastName: 'Mondal',
      phone: '+91 98765 43227',
      emergencyContact: 'Geeta Mondal (+91 98765 43287)',
      address: '77, Banashankari 3rd Stage',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560085',
      dateOfBirth: new Date('1996-01-25'),
      gender: 'MALE',
      joiningDate: new Date('2026-03-01'),
      skills: 'Tile Layer, Granite Polishing, Flooring',
      dailyWageRate: 850.0,
      employmentType: 'DAILY_WAGE',
      status: 'ACTIVE',
      photoUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
    },
  ];

  const labourers: any[] = [];
  for (const lab of labourersData) {
    const l = await prisma.labourer.create({ data: lab });
    labourers.push(l);

    // Leave balance for each labourer
    await prisma.leaveBalance.create({
      data: {
        labourerId: l.id,
        year: 2026,
        casualLeave: 12,
        sickLeave: 10,
        annualLeave: 15,
        usedCasual: 1,
        usedSick: 0,
        usedAnnual: 0,
      },
    });

    // Wage rate record
    await prisma.wageRate.create({
      data: {
        labourerId: l.id,
        rateType: 'DAILY',
        baseRate: l.dailyWageRate,
        overtimeHourlyRate: (l.dailyWageRate / 8) * 1.5,
        currency: 'INR',
        effectiveFrom: new Date('2026-01-01'),
      },
    });
  }
  console.log(`✅ ${labourers.length} Labourers seeded with wage rates & leave balances`);

  // 7. Project Assignments
  for (let i = 0; i < 4; i++) {
    await prisma.projectAssignment.create({
      data: {
        projectId: project1.id,
        labourerId: labourers[i].id,
        contractorId: labourers[i].contractorId,
        assignedDate: new Date('2026-01-20'),
        role: labourers[i].skills?.split(',')[0].trim() || 'Worker',
        status: 'ACTIVE',
      },
    });
  }

  for (let i = 4; i < labourers.length; i++) {
    await prisma.projectAssignment.create({
      data: {
        projectId: project2.id,
        labourerId: labourers[i].id,
        contractorId: labourers[i].contractorId,
        assignedDate: new Date('2026-03-02'),
        role: labourers[i].skills?.split(',')[0].trim() || 'Worker',
        status: 'ACTIVE',
      },
    });
  }

  // 8. Work Tasks
  const task1 = await prisma.workTask.create({
    data: {
      projectId: project1.id,
      title: 'Basement 2 Structural Slab Concreting',
      description: 'Pouring, vibrating, and leveling M35 grade ready-mix concrete over 4500 sqft',
      taskType: 'Concreting',
      priority: 'HIGH',
      targetQuantity: 4500.0,
      unit: 'sqft',
      startDate: new Date('2026-10-01'),
      dueDate: new Date('2026-10-20'),
      status: 'IN_PROGRESS',
    },
  });

  const task2 = await prisma.workTask.create({
    data: {
      projectId: project1.id,
      title: '4th Floor Electrical Conduit & Slab Pipings',
      description: 'Laying 25mm heavy gauge FRLS PVC pipes with fan hooks and junction boxes',
      taskType: 'Electrical',
      priority: 'MEDIUM',
      targetQuantity: 120.0,
      unit: 'points',
      startDate: new Date('2026-10-05'),
      dueDate: new Date('2026-10-25'),
      status: 'IN_PROGRESS',
    },
  });

  // Assign task to labourers
  await prisma.taskAssignment.create({
    data: {
      taskId: task1.id,
      labourerId: labourers[0].id,
      assignedHours: 40.0,
      completedQuantity: 3200.0,
      productivityScore: 104.5,
      status: 'IN_PROGRESS',
      supervisorNotes: 'Excellent pace and quality maintained on slab pouring',
    },
  });

  await prisma.taskAssignment.create({
    data: {
      taskId: task2.id,
      labourerId: labourers[3].id,
      assignedHours: 32.0,
      completedQuantity: 95.0,
      productivityScore: 98.0,
      status: 'IN_PROGRESS',
      supervisorNotes: 'Conduit laying progressing as per structural blueprint',
    },
  });

  // 9. Attendance Records (10 days history for October 2026)
  const today = new Date('2026-10-14T00:00:00Z');
  for (let dayOffset = 9; dayOffset >= 0; dayOffset--) {
    const attDate = new Date(today);
    attDate.setUTCDate(today.getUTCDate() - dayOffset);

    // Skip Sundays (dayOffset % 7 === 3 for demonstration)
    if (attDate.getUTCDay() === 0) continue;

    for (let i = 0; i < labourers.length; i++) {
      const lab = labourers[i];
      let status = 'PRESENT';
      let hours = 8.0;
      let ot = 0.0;

      // Realistic variation
      if (dayOffset === 2 && i === 2) {
        status = 'HALF_DAY';
        hours = 4.0;
      } else if (dayOffset === 4 && i === 4) {
        status = 'PAID_LEAVE';
        hours = 8.0;
      } else if (dayOffset === 1 && (i === 0 || i === 1)) {
        status = 'OVERTIME';
        hours = 8.0;
        ot = 2.5;
      } else if (dayOffset === 0 && i === 7) {
        status = 'ABSENT';
        hours = 0.0;
      }

      const checkIn = status !== 'ABSENT' ? new Date(attDate.getTime() + 8.5 * 3600 * 1000) : null;
      const checkOut = status !== 'ABSENT' ? new Date(attDate.getTime() + (8.5 + hours + ot) * 3600 * 1000) : null;

      await prisma.attendance.create({
        data: {
          labourerId: lab.id,
          projectId: i < 4 ? project1.id : project2.id,
          date: attDate,
          checkInTime: checkIn,
          checkOutTime: checkOut,
          status,
          workingHours: hours,
          overtimeHours: ot,
          isApproved: true,
          approvedById: supervisorUser.id,
          approvalNotes: 'Verified and signed off by Site Supervisor',
        },
      });

      // If overtime, also insert OvertimeRecord
      if (ot > 0) {
        const hourlyRate = (lab.dailyWageRate / 8) * 1.5;
        await prisma.overtimeRecord.create({
          data: {
            labourerId: lab.id,
            projectId: i < 4 ? project1.id : project2.id,
            date: attDate,
            overtimeHours: ot,
            hourlyRate,
            calculatedAmount: ot * hourlyRate,
            status: 'APPROVED',
            approvedById: supervisorUser.id,
            notes: 'Approved overtime for foundation concrete pour curing',
          },
        });
      }
    }
  }
  console.log('✅ Attendance and Overtime records seeded');

  // 10. Advances and Deductions
  const adv1 = await prisma.labourAdvance.create({
    data: {
      labourerId: labourers[0].id,
      amount: 3000.0,
      requestDate: new Date('2026-09-25'),
      disbursementDate: new Date('2026-09-26'),
      recoveryStatus: 'PARTIAL',
      recoveredAmount: 1500.0,
      remainingAmount: 1500.0,
      reason: 'Medical emergency advance for child hospitalization',
      approvedById: adminUser.id,
    },
  });

  const ded1 = await prisma.deduction.create({
    data: {
      labourerId: labourers[1].id,
      type: 'INSURANCE',
      amount: 250.0,
      date: new Date('2026-10-01'),
      reason: 'Group Labourer Personal Accident Insurance Monthly Premium',
      status: 'APPLIED',
    },
  });

  // 11. Salary Records & Slips (September 2026 finalized payroll)
  const baseSalaryRamesh = 850.0 * 24; // 24 days worked
  const otRamesh = 1593.75; // 10 hrs OT @ 159.375
  const bonusRamesh = 1000.0;
  const dedRamesh = 500.0;
  const advRecRamesh = 1500.0;
  // Net Pay = Base Wages + Overtime + Bonuses − Deductions − Advances Recovered
  const netPayRamesh = baseSalaryRamesh + otRamesh + bonusRamesh - dedRamesh - advRecRamesh;

  const salaryRecord1 = await prisma.salaryRecord.create({
    data: {
      salaryCode: 'SAL-2026-09-001',
      labourerId: labourers[0].id,
      periodMonth: '2026-09',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
      baseWages: baseSalaryRamesh,
      overtimeAmount: otRamesh,
      bonusAmount: bonusRamesh,
      deductionsAmount: dedRamesh,
      advancesRecovered: advRecRamesh,
      netPay: netPayRamesh,
      status: 'PAID',
      calculatedById: supervisorUser.id,
      approvedById: adminUser.id,
      approvalDate: new Date('2026-10-02'),
      notes: 'September payroll approved and disbursed successfully',
    },
  });

  // Salary Components
  const components = [
    { salaryRecordId: salaryRecord1.id, type: 'EARNING', name: 'Base Wages (24 Days)', amount: baseSalaryRamesh, description: '₹850 x 24 days worked' },
    { salaryRecordId: salaryRecord1.id, type: 'EARNING', name: 'Approved Overtime (10 hrs)', amount: otRamesh, description: '1.5x hourly rate' },
    { salaryRecordId: salaryRecord1.id, type: 'EARNING', name: 'Site Performance Bonus', amount: bonusRamesh, description: 'Zero safety violations & milestone achievement' },
    { salaryRecordId: salaryRecord1.id, type: 'DEDUCTION', name: 'Statutory Welfare Fund', amount: dedRamesh, description: 'Labour Welfare Cess deduction' },
    { salaryRecordId: salaryRecord1.id, type: 'DEDUCTION', name: 'Advance Loan Recovery', amount: advRecRamesh, description: 'EMI 1 of 2 recovered' },
  ];
  for (const c of components) {
    await prisma.salaryComponent.create({ data: c });
  }

  // Salary Slip
  await prisma.salarySlip.create({
    data: {
      slipNumber: 'SLIP-2026-09-0001',
      salaryRecordId: salaryRecord1.id,
      labourerId: labourers[0].id,
      generatedDate: new Date('2026-10-02'),
      period: 'September 2026',
      totalDaysWorked: 24,
      totalHoursWorked: 192,
      grossPay: baseSalaryRamesh + otRamesh + bonusRamesh,
      totalDeductions: dedRamesh + advRecRamesh,
      netPay: netPayRamesh,
    },
  });

  // Payment Transaction
  await prisma.paymentTransaction.create({
    data: {
      transactionRef: 'TXN-20261003-88491',
      salaryRecordId: salaryRecord1.id,
      labourerId: labourers[0].id,
      amount: netPayRamesh,
      paymentMethod: 'BANK_TRANSFER',
      paymentDate: new Date('2026-10-03'),
      status: 'COMPLETED',
      paidById: adminUser.id,
      remarks: 'Direct NEFT transfer to SBI Account **5421',
    },
  });

  // October Draft Salary Record for Santosh
  const baseSalarySantosh = 800.0 * 11;
  const netPaySantosh = baseSalarySantosh + 750.0 - 250.0;
  const salaryRecord2 = await prisma.salaryRecord.create({
    data: {
      salaryCode: 'SAL-2026-10-002',
      labourerId: labourers[1].id,
      periodMonth: '2026-10',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-14'),
      baseWages: baseSalarySantosh,
      overtimeAmount: 750.0,
      bonusAmount: 0.0,
      deductionsAmount: 250.0,
      advancesRecovered: 0.0,
      netPay: netPaySantosh,
      status: 'APPROVED',
      calculatedById: supervisorUser.id,
      approvedById: adminUser.id,
      approvalDate: new Date('2026-10-14'),
      notes: 'Mid-month approved wages pending disbursement',
    },
  });

  console.log('✅ Salary records, slips, and payment transactions seeded');

  // 12. Leave Requests
  await prisma.leaveRequest.create({
    data: {
      labourerId: labourers[0].id,
      leaveType: 'CASUAL',
      startDate: new Date('2026-10-25'),
      endDate: new Date('2026-10-26'),
      totalDays: 2.0,
      reason: 'Attending village festival and family function',
      status: 'PENDING',
    },
  });

  await prisma.leaveRequest.create({
    data: {
      labourerId: labourers[2].id,
      leaveType: 'SICK',
      startDate: new Date('2026-10-08'),
      endDate: new Date('2026-10-08'),
      totalDays: 1.0,
      reason: 'Viral fever and doctor checkup',
      status: 'APPROVED',
      reviewedById: supervisorUser.id,
      reviewNotes: 'Medical slip submitted and approved',
    },
  });

  // 13. Notifications
  const notifications = [
    {
      userId: adminUser.id,
      title: 'Pending Leave Request',
      message: 'Ramesh Kumar (LBR-2026-0001) has submitted a Casual Leave request for 2 days.',
      type: 'LEAVE',
      link: '/leaves',
    },
    {
      userId: supervisorUser.id,
      title: 'Attendance Sign-off Required',
      message: '8 labour attendance entries for Metro City Commercial Tower need approval.',
      type: 'ATTENDANCE',
      link: '/attendance',
    },
    {
      userId: labourerUser.id,
      labourerId: labourers[0].id,
      title: 'Salary Slip Generated',
      message: 'Your salary slip for September 2026 has been generated. Net Pay: ₹' + netPayRamesh.toFixed(2),
      type: 'WAGE',
      link: '/salaries',
    },
    {
      userId: contractorUser.id,
      title: 'Contractor Wage Summary',
      message: 'Wages for 5 labourers under Apex Manpower have been approved for processing.',
      type: 'WAGE',
      link: '/salaries',
    },
  ];

  for (const n of notifications) {
    await prisma.notification.create({ data: n });
  }

  // 14. System Settings
  const settingsData = [
    { category: 'COMPANY', key: 'COMPANY_NAME', value: 'Apex BuildTech Infrastructure Ltd', description: 'Organization Legal Name' },
    { category: 'COMPANY', key: 'COMPANY_ADDRESS', value: 'Apex Tower, 100 Feet Ring Road, Bengaluru 560078', description: 'Headquarters Address' },
    { category: 'COMPANY', key: 'CURRENCY', value: 'INR (₹)', description: 'Default system currency symbol' },
    { category: 'WORKING_HOURS', key: 'STANDARD_SHIFT_HOURS', value: '8.0', description: 'Standard daily working hours' },
    { category: 'WORKING_HOURS', key: 'OVERTIME_RATE_MULTIPLIER', value: '1.5', description: 'Multiplier for hourly overtime computation' },
    { category: 'LEAVE_POLICIES', key: 'MAX_CASUAL_LEAVES', value: '12', description: 'Annual quota for casual leaves' },
    { category: 'LEAVE_POLICIES', key: 'MAX_SICK_LEAVES', value: '10', description: 'Annual quota for sick leaves' },
    { category: 'SYSTEM', key: 'AUTO_APPROVE_ATTENDANCE', value: 'false', description: 'Require supervisor sign-off on attendance' },
  ];

  for (const s of settingsData) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  // 15. Audit Logs
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: 'LOGIN',
      module: 'AUTH',
      details: JSON.stringify({ message: 'Administrator login session started' }),
      ipAddress: '127.0.0.1',
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: 'APPROVE',
      module: 'SALARY',
      targetId: salaryRecord1.id,
      details: JSON.stringify({ amount: netPayRamesh, period: '2026-09' }),
      ipAddress: '127.0.0.1',
    },
  });

  console.log('✅ Notifications, Settings, and Audit Logs seeded');
  console.log('🚀 LMS Database Seed Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
