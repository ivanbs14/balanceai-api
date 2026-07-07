import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FixedCostMonthlyStatus, FixedCostRecurrence } from '@prisma/client';
import { FixedCostService } from './fixed-cost.service';

describe('FixedCostService', () => {
  const prismaMock = {
    fixedCost: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    fixedCostMonthly: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  } as any;

  let service: FixedCostService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FixedCostService(prismaMock);
  });

  it('should create a fixed cost with startDate', async () => {
    prismaMock.fixedCost.create.mockResolvedValue({ id: 'fixed-1' });

    await service.create({
      userId: 'user-1',
      name: 'Aluguel',
      defaultAmount: '1200.00',
      recurrence: FixedCostRecurrence.MONTHLY,
      startDate: '2026-07-15',
      dueDay: 15,
      isActive: true,
    });

    expect(prismaMock.fixedCost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Aluguel',
        startDate: new Date('2026-07-15'),
      }),
    });
  });

  it('should only project active recurring costs for eligible competences', async () => {
    prismaMock.fixedCost.findMany.mockResolvedValue([
      {
        id: 'fixed-monthly',
        userId: 'user-1',
        name: 'Aluguel',
        defaultAmount: '1200.00',
        recurrence: FixedCostRecurrence.MONTHLY,
        startDate: new Date('2026-07-15T00:00:00.000Z'),
        dueDay: 15,
        isActive: true,
        monthlys: [],
      },
      {
        id: 'fixed-quarterly',
        userId: 'user-1',
        name: 'Seguro',
        defaultAmount: '600.00',
        recurrence: FixedCostRecurrence.QUARTERLY,
        startDate: new Date('2026-07-10T00:00:00.000Z'),
        dueDay: 10,
        isActive: true,
        monthlys: [],
      },
      {
        id: 'fixed-inactive',
        userId: 'user-1',
        name: 'Antigo',
        defaultAmount: '50.00',
        recurrence: FixedCostRecurrence.MONTHLY,
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        dueDay: 1,
        isActive: false,
        monthlys: [],
      },
    ]);

    const julyResult = await service.findByUserIdAndMonth('user-1', '2026-07');
    const augustResult = await service.findByUserIdAndMonth('user-1', '2026-08');

    expect(julyResult.data.map((item) => item.id)).toEqual(['fixed-monthly', 'fixed-quarterly']);
    expect(augustResult.data.map((item) => item.id)).toEqual(['fixed-monthly']);
  });

  it('should derive default monthly data when monthly row is missing', async () => {
    prismaMock.fixedCost.findMany.mockResolvedValue([
      {
        id: 'fixed-1',
        userId: 'user-1',
        name: 'Internet',
        defaultAmount: '100.00',
        recurrence: FixedCostRecurrence.MONTHLY,
        startDate: new Date('2026-07-05T00:00:00.000Z'),
        dueDay: 5,
        isActive: true,
        monthlys: [],
      },
    ]);

    const result = await service.findByUserIdAndMonth('user-1', '2026-09');

    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: 'fixed-1',
          monthly: {
            id: null,
            competence: '2026-09',
            status: FixedCostMonthlyStatus.PENDING,
            amount: '100.00',
            paidAt: null,
          },
        }),
      ],
    });
  });

  it('should reject invalid competence format', async () => {
    await expect(service.findByUserIdAndMonth('user-1', '2026/07')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should update monthly status for a competence', async () => {
    prismaMock.fixedCost.findUnique.mockResolvedValue({
      id: 'fixed-1',
      defaultAmount: '300.00',
    });
    prismaMock.fixedCostMonthly.findUnique.mockResolvedValue(null);
    prismaMock.fixedCostMonthly.create.mockResolvedValue({ id: 'monthly-1' });

    await service.updateMonthly('fixed-1', '2026-08', {
      status: FixedCostMonthlyStatus.PAID,
    });

    expect(prismaMock.fixedCostMonthly.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fixedCostId: 'fixed-1',
        competence: '2026-08',
        status: FixedCostMonthlyStatus.PAID,
        amount: '300.00',
      }),
    });
  });

  it('should throw when updating monthly for missing fixed cost', async () => {
    prismaMock.fixedCost.findUnique.mockResolvedValue(null);

    await expect(
      service.updateMonthly('fixed-missing', '2026-08', {
        status: FixedCostMonthlyStatus.PAID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
