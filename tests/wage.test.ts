/**
 * Unit Tests for LMS Wage Calculation Formula
 * Formula: Net Pay = Base Wages + Overtime + Bonuses − Deductions − Advances Recovered
 */

describe('Wage Calculation Formula Unit Tests', () => {
  const calculateNetPay = (params: {
    daysWorked: number;
    dailyRate: number;
    otHours: number;
    bonus: number;
    deductions: number;
    advancesRecovered: number;
  }) => {
    const baseWages = params.daysWorked * params.dailyRate;
    const hourlyRate = (params.dailyRate / 8) * 1.5;
    const overtimeAmount = params.otHours * hourlyRate;
    const grossEarnings = baseWages + overtimeAmount + params.bonus;
    const totalDeductions = params.deductions + params.advancesRecovered;
    const netPay = Math.round((grossEarnings - totalDeductions) * 100) / 100;
    return {
      baseWages: Math.round(baseWages * 100) / 100,
      overtimeAmount: Math.round(overtimeAmount * 100) / 100,
      grossEarnings: Math.round(grossEarnings * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      netPay,
    };
  };

  test('should accurately calculate standard full-month wages without overtime or deductions', () => {
    const result = calculateNetPay({
      daysWorked: 26,
      dailyRate: 800,
      otHours: 0,
      bonus: 0,
      deductions: 0,
      advancesRecovered: 0,
    });

    expect(result.baseWages).toBe(20800);
    expect(result.overtimeAmount).toBe(0);
    expect(result.grossEarnings).toBe(20800);
    expect(result.totalDeductions).toBe(0);
    expect(result.netPay).toBe(20800);
  });

  test('should correctly compute overtime at 1.5x hourly rate', () => {
    // dailyRate 800 -> hourly regular = 100 -> 1.5x = 150/hr
    // 10 hours overtime -> 1500
    const result = calculateNetPay({
      daysWorked: 20,
      dailyRate: 800,
      otHours: 10,
      bonus: 500,
      deductions: 200,
      advancesRecovered: 1000,
    });

    expect(result.baseWages).toBe(16000);
    expect(result.overtimeAmount).toBe(1500);
    expect(result.grossEarnings).toBe(18000);
    expect(result.totalDeductions).toBe(1200);
    // Net Pay = 16000 + 1500 + 500 - 200 - 1000 = 16800
    expect(result.netPay).toBe(16800);
  });

  test('should accurately apply advance recovery and statutory deductions', () => {
    const result = calculateNetPay({
      daysWorked: 24,
      dailyRate: 850,
      otHours: 4, // 4 * (850/8 * 1.5) = 4 * 159.375 = 637.5
      bonus: 1000,
      deductions: 500,
      advancesRecovered: 2000,
    });

    expect(result.baseWages).toBe(20400);
    expect(result.overtimeAmount).toBe(637.5);
    expect(result.grossEarnings).toBe(22037.5);
    expect(result.totalDeductions).toBe(2500);
    // Net Pay = 20400 + 637.5 + 1000 - 500 - 2000 = 19537.5
    expect(result.netPay).toBe(19537.5);
  });

  test('should handle half-day attendance correctly in base wage calculation', () => {
    // 21.5 days worked @ 600/day = 12900
    const result = calculateNetPay({
      daysWorked: 21.5,
      dailyRate: 600,
      otHours: 0,
      bonus: 0,
      deductions: 100,
      advancesRecovered: 0,
    });

    expect(result.baseWages).toBe(12900);
    expect(result.netPay).toBe(12800);
  });
});
