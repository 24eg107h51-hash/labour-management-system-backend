import request from 'supertest';
import app from '../src/server';
import prisma from '../src/config/database';

describe('Labour Management System API Integration Tests', () => {
  let authToken: string;

  beforeAll(async () => {
    // Perform login with seeded admin credentials
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@lms.com',
        password: 'Admin@123',
      });

    if (res.body?.data?.token) {
      authToken = res.body.data.token;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('GET /api/health should return 200 and healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  test('POST /api/auth/login with valid credentials should return token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@lms.com',
        password: 'Admin@123',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user.email).toBe('admin@lms.com');
  });

  test('POST /api/auth/login with invalid password should fail with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@lms.com',
        password: 'WrongPassword!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/labourers should return list of registered labourers', async () => {
    const res = await request(app)
      .get('/api/labourers')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('GET /api/reports/dashboard should return KPI metrics', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totalLabourers');
    expect(res.body.data).toHaveProperty('totalWagesPayable');
  });

  test('Duplicate payment prevention: attempting duplicate txnRef should return 409', async () => {
    // 1. Get an existing payment transaction
    const existingTxn = await prisma.paymentTransaction.findFirst();
    if (!existingTxn) return;

    // 2. Try to insert payment with the exact same transactionRef
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        salaryRecordId: existingTxn.salaryRecordId,
        amount: 100,
        paymentMethod: 'CASH',
        transactionRef: existingTxn.transactionRef,
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Duplicate transaction reference detected');
  });
});
