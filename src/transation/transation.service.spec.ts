/* eslint-disable prettier/prettier */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TransationPaymentMethod, TransationPaymentStatus } from '@prisma/client';
import { TransationService } from './transation.service';

describe('TransationService', () => {
  const prismaMock = {
    transation: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    card: {
      findFirst: jest.fn(),
    },
    fixedCostMonthly: {
      aggregate: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(async (callback: any) => callback(prismaMock)),
  } as any;

  const fixedCostServiceMock = {
    findByUserIdAndMonth: jest.fn(),
  } as any;

  let service: TransationService;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.transation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.fixedCostMonthly.findUnique.mockResolvedValue(null);
    prismaMock.fixedCostMonthly.count.mockResolvedValue(0);
    prismaMock.fixedCostMonthly.updateMany.mockResolvedValue({ count: 0 });
    service = new TransationService(prismaMock, fixedCostServiceMock);
  });

  it('rejeita edição do grupo se outra parcela estiver vinculada', async () => {
    const anchor = {
      id: 'anchor', userId: 'user-1', installmentGroupId: 'group-linked',
      paymentMethod: TransationPaymentMethod.PIX, installments: 2,
      paymentStatus: TransationPaymentStatus.PENDING, Date: new Date('2026-10-01T00:00:00.000Z'),
    };
    prismaMock.transation.findUnique.mockResolvedValue(anchor);
    prismaMock.transation.findMany.mockResolvedValue([
      anchor,
      { ...anchor, id: 'linked-parcel', Date: new Date('2026-11-01T00:00:00.000Z') },
    ]);
    prismaMock.fixedCostMonthly.count.mockResolvedValue(1);

    await expect(service.updateInstallmentGroup('anchor', 'user-1', {
      name: 'Compra', amount: '100.00', Date: '2026-10-01',
      paymentMethod: TransationPaymentMethod.PIX, installments: 2,
    } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(prismaMock.fixedCostMonthly.count).toHaveBeenCalledWith({
      where: { transactionId: { in: ['anchor', 'linked-parcel'] } },
    });
    expect(prismaMock.transation.updateMany).not.toHaveBeenCalled();
  });

  it('should create a deposit transaction with the provided userId', async () => {
    prismaMock.transation.create.mockResolvedValue({ id: 'tx-new', userId: 'user-1' });

    await service.create({
      userId: 'user-1',
      name: 'Salario',
      paymentStatus: TransationPaymentStatus.PAID,
      type: 'DEPOSIT',
      amount: '1500.00',
      category: 'SALARY',
      paymentMethod: 'PIX',
      Date: '2026-06-08',
    } as any);

    expect(prismaMock.transation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        name: 'Salario',
        type: 'DEPOSIT',
      }),
    });
  });

  it('should create an investment transaction with the provided userId', async () => {
    prismaMock.transation.create.mockResolvedValue({ id: 'tx-invest', userId: 'user-1' });

    await service.create({
      userId: 'user-1',
      name: 'Tesouro Selic',
      type: 'INVESTMENT',
      amount: '350.00',
      category: 'OTHER',
      paymentMethod: 'Bank_Transfer',
      Date: '2026-06-08',
    } as any);

    expect(prismaMock.transation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        name: 'Tesouro Selic',
        type: 'INVESTMENT',
      }),
    });
  });

  it('should create pix installments when installments is greater than one', async () => {
    prismaMock.transation.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `${data.installmentInfo}`, ...data }),
    );

    const result = await service.create({
      userId: 'user-1',
      name: 'Notebook',
      type: 'EXPENSE',
      amount: '100.00',
      category: 'OTHER',
      paymentMethod: TransationPaymentMethod.PIX,
      installments: 3,
      Date: '2026-07-02',
      withdrawal: 'DEPOSIT',
    } as any);

    expect(Array.isArray(result)).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.transation.create).toHaveBeenCalledTimes(3);
    expect(
      prismaMock.transation.create.mock.calls.map(([call]: any[]) => call.data.amount.toFixed(2)),
    ).toEqual(['33.34', '33.33', '33.33']);
    expect(prismaMock.transation.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMethod: TransationPaymentMethod.PIX,
          amount: expect.anything(),
          installmentInfo: '1/3',
        }),
      }),
    );
  });

  it('should keep single pix transaction when installments is one', async () => {
    prismaMock.transation.create.mockResolvedValue({ id: 'tx-1' });

    await service.create({
      userId: 'user-1',
      name: 'Curso',
      type: 'EXPENSE',
      amount: '120.00',
      category: 'OTHER',
      paymentMethod: TransationPaymentMethod.PIX,
      installments: 1,
      Date: '2026-07-02',
      withdrawal: 'DEPOSIT',
    } as any);

    expect(prismaMock.transation.create).toHaveBeenCalledTimes(1);
  });

  it('should still require card lookup only for credit card', async () => {
    prismaMock.card.findFirst.mockResolvedValue({ id: 'card-1', userId: 'user-1', name: 'Nubank' });
    prismaMock.transation.create.mockResolvedValue({ id: 'tx-card' });

    await service.create({
      userId: 'user-1',
      name: 'Mesa',
      type: 'EXPENSE',
      amount: '300.00',
      category: 'OTHER',
      paymentMethod: TransationPaymentMethod.CREDIT_CARD,
      installments: 1,
      cardId: 'card-1',
      Date: '2026-07-02',
      withdrawal: 'DEPOSIT',
    } as any);

    expect(prismaMock.card.findFirst).toHaveBeenCalledWith({
      where: { id: 'card-1', userId: 'user-1' },
    });
  });

  it('should mark transaction as PAID and set paidAt when paidAt is not provided', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({ id: 'tx-1', userId: 'user-1' });
    prismaMock.transation.update.mockResolvedValue({
      id: 'tx-1',
      paymentStatus: 'PAID',
      paidAt: new Date(),
    });

    await service.updatePaymentStatus('tx-1', 'user-1', {
      paymentStatus: TransationPaymentStatus.PAID,
    });

    expect(prismaMock.transation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: expect.objectContaining({
          paymentStatus: TransationPaymentStatus.PAID,
        }),
      }),
    );

    const updatePayload = prismaMock.transation.update.mock.calls[0][0];
    expect(updatePayload.data.paidAt).toBeInstanceOf(Date);
  });

  it('should mark transaction as PENDING and clear paidAt', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({ id: 'tx-2', userId: 'user-1' });
    prismaMock.transation.update.mockResolvedValue({
      id: 'tx-2',
      paymentStatus: 'PENDING',
      paidAt: null,
    });

    await service.updatePaymentStatus('tx-2', 'user-1', {
      paymentStatus: TransationPaymentStatus.PENDING,
    });

    expect(prismaMock.transation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-2' },
        data: {
          paymentStatus: TransationPaymentStatus.PENDING,
          paidAt: null,
        },
      }),
    );
  });

  it('should throw NotFoundException when transaction does not exist', async () => {
    prismaMock.transation.findUnique.mockResolvedValue(null);

    await expect(
      service.updatePaymentStatus('tx-missing', 'user-1', {
        paymentStatus: TransationPaymentStatus.PAID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should throw NotFoundException when transaction belongs to another user', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({ id: 'tx-2', userId: 'user-2' });

    await expect(
      service.updatePaymentStatus('tx-2', 'user-1', {
        paymentStatus: TransationPaymentStatus.PAID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should apply paymentStatus filter in monthly listing', async () => {
    prismaMock.transation.findMany.mockResolvedValue([]);
    prismaMock.transation.count.mockResolvedValue(0);

    await service.findByUserIdAndMonth(
      'user-1',
      '2026-06',
      1,
      10,
      TransationPaymentStatus.PAID,
    );

    expect(prismaMock.transation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          paymentStatus: TransationPaymentStatus.PAID,
        }),
      }),
    );

    expect(prismaMock.transation.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentStatus: TransationPaymentStatus.PAID,
        }),
      }),
    );
  });

  it('should return the unified summary without adding fixed costs twice', async () => {
    jest.spyOn(service, 'getAllBalance').mockResolvedValue({
      totalValues: {
        totalExpenses: 100,
        totalInvestments: 50,
        totalDeposits: 500,
        balance: 350,
      },
      percentsValues: {
        expensePercentage: 20,
        investmentPercentage: 10,
        depositPercentage: 70,
      },
      topCategories: [],
      lastTransactions: [],
      anualBalance: [],
    } as any);
    jest.spyOn(service, 'getTopCreditCardsByMonth').mockResolvedValue({ topCredcards: [] } as any);
    prismaMock.transation.findMany.mockResolvedValue([]);
    prismaMock.transation.count.mockResolvedValue(0);
    fixedCostServiceMock.findByUserIdAndMonth.mockResolvedValue({
      data: [
        {
          id: 'fixed-1',
          defaultAmount: 25,
          monthly: { amount: 25, competence: '2026-07', status: 'PENDING', paidAt: null },
        },
        {
          id: 'fixed-2',
          defaultAmount: 40,
          monthly: { amount: 35, competence: '2026-07', status: 'PAID', paidAt: null },
        },
      ],
    });

    const result = await service.getDashboardMonthlyData('user-1', '2026-07');

    expect(result.summary.totalValues).toEqual({
      totalExpenses: 100,
      totalInvestments: 50,
      totalDeposits: 500,
      balance: 350,
    });
    expect(result.summary.percentsValues).toEqual({
      expensePercentage: 20,
      investmentPercentage: 10,
      depositPercentage: 70,
    });
  });

  it('propaga falha de leitura do cartão ao montar o dashboard', async () => {
    const summarySpy = jest.spyOn(service, 'getAllBalance').mockResolvedValue({} as any);
    const cardSpy = jest.spyOn(service, 'getTopCreditCardsByMonth').mockRejectedValue(new Error('database unavailable'));
    fixedCostServiceMock.findByUserIdAndMonth.mockResolvedValue({ data: [] });
    prismaMock.transation.findMany.mockResolvedValue([]);

    await expect(service.getDashboardMonthlyData('user-1', '2026-07'))
      .rejects.toThrow('database unavailable');
    summarySpy.mockRestore();
    cardSpy.mockRestore();
  });

  it('separates available cash, invested position, paid expenses and forecasts', async () => {
    prismaMock.transation.groupBy
      .mockResolvedValueOnce([
        { type: 'DEPOSIT', paymentStatus: 'PENDING', _sum: { amount: 1000 } },
        { type: 'INVESTMENT', paymentStatus: 'PENDING', _sum: { amount: 200 } },
        { type: 'EXPENSE', paymentStatus: 'PAID', _sum: { amount: 100 } },
        { type: 'EXPENSE', paymentStatus: 'PENDING', _sum: { amount: 30 } },
      ])
      .mockResolvedValueOnce([{ category: 'FOOD', _sum: { amount: 100 }, _count: { id: 1 } }])
      .mockResolvedValueOnce([
        { type: 'DEPOSIT', paymentStatus: 'PENDING', _sum: { amount: 1000 } },
        { type: 'INVESTMENT', paymentStatus: 'PENDING', _sum: { amount: 200 } },
        { type: 'EXPENSE', paymentStatus: 'PAID', _sum: { amount: 100 } },
      ])
      .mockResolvedValueOnce([
        { type: 'EXPENSE', paymentStatus: 'PAID', withdrawal: 'INVESTMENT', _sum: { amount: 100 } },
        { type: 'EXPENSE', paymentStatus: 'PENDING', withdrawal: 'DEPOSIT', _sum: { amount: 30 } },
      ])
      .mockResolvedValueOnce([
        { type: 'EXPENSE', paymentStatus: 'PAID', withdrawal: 'INVESTMENT', _sum: { amount: 100 } },
      ]);
    prismaMock.transation.findMany.mockResolvedValue([]);
    prismaMock.fixedCostMonthly.aggregate.mockResolvedValue({ _sum: { amount: 50 } });
    fixedCostServiceMock.findByUserIdAndMonth.mockResolvedValue({
      data: [
        { category: 'HOUSING', defaultAmount: 50, monthly: { amount: 50, status: 'PAID' } },
        { category: 'UTILITY', defaultAmount: 25, monthly: { amount: 25, status: 'PENDING' } },
      ],
    });

    const summary = await service.getAllBalance('user-1', '2026-07');

    expect(summary.totalValues).toMatchObject({
      totalDeposits: 1000,
      totalExpenses: 150,
      realizedExpenses: 150,
      forecastExpenses: 55,
      paidFixedCosts: 50,
      pendingFixedCosts: 25,
      totalInvestments: 100,
      investedPosition: 100,
      balance: 750,
      projectedBalance: 695,
    });
    expect(summary.topCategories).toEqual([
      { category: 'FOOD', percent: 66.7, value: 100 },
      { category: 'HOUSING', percent: 33.3, value: 50 },
    ]);
    expect(summary.anualBalance[0].value).toBe(750);
  });

  it('uses all twelve competences for annual realized fixed costs', async () => {
    prismaMock.transation.groupBy.mockResolvedValue([]);
    prismaMock.transation.findMany.mockResolvedValue([]);
    fixedCostServiceMock.findByUserIdAndMonth.mockResolvedValue({
      data: [{ category: 'HOUSING', defaultAmount: 10, monthly: { amount: 10, status: 'PAID' } }],
    });

    const summary = await service.getAllBalance('user-1', '2026');

    expect(fixedCostServiceMock.findByUserIdAndMonth).toHaveBeenCalledTimes(12);
    expect(fixedCostServiceMock.findByUserIdAndMonth).toHaveBeenCalledWith('user-1', '2026-12');
    expect(summary.totalValues).toMatchObject({ totalExpenses: 120, paidFixedCosts: 120, balance: -120 });
    expect(summary.anualBalance[0].value).toBe(-120);
    expect(prismaMock.fixedCostMonthly.aggregate).not.toHaveBeenCalled();
  });

  it('should update a non-installment pending transaction', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-edit-1',
      userId: 'user-1',
      paymentMethod: TransationPaymentMethod.PIX,
      paymentStatus: TransationPaymentStatus.PENDING,
      installments: 1,
    });
    prismaMock.transation.update.mockResolvedValue({
      id: 'tx-edit-1',
      name: 'Mercado',
      amount: '120.00',
    });

    await service.update('tx-edit-1', 'user-1', {
      name: 'Mercado',
      amount: '120.00',
    } as any);

    expect(prismaMock.transation.update).toHaveBeenCalledWith({
      where: { id: 'tx-edit-1' },
      data: {
        name: 'Mercado',
        amount: '120.00',
      },
    });
  });

  it('should reject editing name or amount for paid transactions', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-edit-2',
      userId: 'user-1',
      paymentMethod: TransationPaymentMethod.PIX,
      paymentStatus: TransationPaymentStatus.PAID,
      installments: 1,
    });

    await expect(
      service.update('tx-edit-2', 'user-1', {
        name: 'Academia',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject editing name or amount for installment transactions', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-edit-3',
      userId: 'user-1',
      paymentMethod: TransationPaymentMethod.CREDIT_CARD,
      paymentStatus: TransationPaymentStatus.PENDING,
      installments: 3,
    });

    await expect(
      service.update('tx-edit-3', 'user-1', {
        amount: '200.00',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should edit pending installments without touching a paid parcel', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-group-1',
      userId: 'user-1',
      type: 'EXPENSE',
      category: 'OTHER',
      isFixed: false,
      withdrawal: 'DEPOSIT',
      installmentGroupId: 'group-1',
      paymentMethod: TransationPaymentMethod.PIX,
      installments: 3,
    });
    prismaMock.transation.findMany
      .mockResolvedValueOnce([
        {
          id: 'tx-group-1',
          userId: 'user-1',
          installmentGroupId: 'group-1',
          paymentMethod: TransationPaymentMethod.PIX,
          paymentStatus: TransationPaymentStatus.PAID,
          installments: 3,
          installmentInfo: '1/3',
          Date: new Date('2026-07-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-02T00:00:00.000Z'),
        },
        {
          id: 'tx-group-2',
          userId: 'user-1',
          installmentGroupId: 'group-1',
          paymentMethod: TransationPaymentMethod.PIX,
          paymentStatus: TransationPaymentStatus.PENDING,
          installments: 3,
          installmentInfo: '2/3',
          Date: new Date('2026-08-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-02T00:00:01.000Z'),
        },
        {
          id: 'tx-group-3',
          userId: 'user-1',
          installmentGroupId: 'group-1',
          paymentMethod: TransationPaymentMethod.PIX,
          paymentStatus: TransationPaymentStatus.PENDING,
          installments: 3,
          installmentInfo: '3/3',
          Date: new Date('2026-09-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-02T00:00:02.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ id: 'tx-group-1' }, { id: 'tx-group-2' }, { id: 'tx-group-3' }]);
    prismaMock.transation.update.mockImplementation(({ where, data }: any) =>
      Promise.resolve({ id: where.id, ...data }),
    );

    await service.updateInstallmentGroup('tx-group-1', 'user-1', {
      name: 'Notebook Pro',
      amount: '100.00',
      Date: '2026-10-05',
      installments: 3,
      paymentMethod: TransationPaymentMethod.PIX,
    } as any);

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.transation.updateMany).toHaveBeenCalledTimes(2);
    expect(
      prismaMock.transation.updateMany.mock.calls.map(([call]: any[]) => call.data.amount.toFixed(2)),
    ).toEqual(['33.34', '33.33']);
    expect(prismaMock.transation.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.transation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: expect.anything(), installmentInfo: '4/4' }),
    });
    expect(prismaMock.transation.updateMany.mock.calls.every(([call]: any[]) => call.where.id !== 'tx-group-1')).toBe(true);
    expect(prismaMock.transation.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: 'tx-group-2',
          userId: 'user-1',
          installmentGroupId: 'group-1',
          paymentStatus: TransationPaymentStatus.PENDING,
        },
        data: expect.objectContaining({
          name: 'Notebook Pro',
          amount: expect.anything(),
          installments: 4,
          installmentInfo: '2/4',
          paymentMethod: TransationPaymentMethod.PIX,
          cardId: null,
          nameCard: null,
          Date: new Date('2026-10-05T00:00:00.000Z'),
        }),
      }),
    );
    expect(prismaMock.transation.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: 'tx-group-3',
          userId: 'user-1',
          installmentGroupId: 'group-1',
          paymentStatus: TransationPaymentStatus.PENDING,
        },
        data: expect.objectContaining({
          installmentInfo: '3/4',
          Date: new Date('2026-11-05T00:00:00.000Z'),
        }),
      }),
    );
  });

  it('summarizes only the pending amount and rejects editing a fully paid group', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'paid-1', userId: 'user-1', paymentMethod: TransationPaymentMethod.PIX,
      installments: 3, installmentGroupId: 'group-summary',
    });
    const paid = {
      id: 'paid-1', name: 'Old name', amount: 40, paymentStatus: TransationPaymentStatus.PAID,
      installments: 3, installmentInfo: '1/3', Date: new Date('2026-07-01T00:00:00.000Z'),
    };
    prismaMock.transation.findMany.mockResolvedValueOnce([
      paid,
      {
        id: 'pending-2', name: 'New name', amount: 30, paymentStatus: TransationPaymentStatus.PENDING,
        installments: 3, installmentInfo: '2/3', Date: new Date('2026-08-01T00:00:00.000Z'),
        paymentMethod: TransationPaymentMethod.PIX, cardId: null, nameCard: null,
      },
      {
        id: 'pending-3', name: 'New name', amount: 30, paymentStatus: TransationPaymentStatus.PENDING,
        installments: 3, installmentInfo: '3/3', Date: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]).mockResolvedValueOnce([paid]);

    await expect(service.getInstallmentGroupSummary('paid-1', 'user-1')).resolves.toMatchObject({
      name: 'New name', totalAmount: '60.00', startDate: '2026-08-01',
      installments: 2, paidInstallments: 1,
    });
    await expect(service.getInstallmentGroupSummary('paid-1', 'user-1')).rejects.toMatchObject({ status: 409 });
  });

  it('aborts editing if a pending installment becomes paid before its update', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-race-1', userId: 'user-1', type: 'EXPENSE', category: 'OTHER',
      paymentMethod: TransationPaymentMethod.PIX, installments: 2,
      installmentGroupId: 'group-race', withdrawal: 'DEPOSIT', isFixed: false,
    });
    prismaMock.transation.findMany.mockResolvedValueOnce([
      {
        id: 'tx-race-1', userId: 'user-1', paymentStatus: TransationPaymentStatus.PENDING,
        installmentInfo: '1/2', Date: new Date('2026-07-01T00:00:00.000Z'),
      },
      {
        id: 'tx-race-2', userId: 'user-1', paymentStatus: TransationPaymentStatus.PENDING,
        installmentInfo: '2/2', Date: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.transation.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.updateInstallmentGroup('tx-race-1', 'user-1', {
      name: 'Changed', amount: '100.00', Date: '2026-10-01', installments: 2,
      paymentMethod: TransationPaymentMethod.PIX,
    } as any)).rejects.toMatchObject({ status: 409 });
    expect(prismaMock.transation.create).not.toHaveBeenCalled();
    expect(prismaMock.transation.deleteMany).not.toHaveBeenCalled();
  });

  it('should reject grouped editing for non-installment transactions', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-single',
      userId: 'user-1',
      paymentMethod: TransationPaymentMethod.PIX,
      installments: 1,
      installmentGroupId: null,
    });

    await expect(
      service.updateInstallmentGroup('tx-single', 'user-1', {
        name: 'Mercado',
        amount: '100.00',
        Date: '2026-07-02',
        installments: 2,
        paymentMethod: TransationPaymentMethod.PIX,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should create extra parcels when installment count increases', async () => {
    prismaMock.card.findFirst.mockResolvedValue({ id: 'card-1', userId: 'user-1', name: 'Nubank' });
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-card-1',
      userId: 'user-1',
      type: 'EXPENSE',
      category: 'OTHER',
      isFixed: false,
      withdrawal: 'DEPOSIT',
      installmentGroupId: 'group-card',
      paymentMethod: TransationPaymentMethod.CREDIT_CARD,
      installments: 2,
    });
    prismaMock.transation.findMany
      .mockResolvedValueOnce([
        {
          id: 'tx-card-1',
          installmentInfo: '1/2',
          paymentStatus: 'PAID',
          installments: 2,
          paymentMethod: 'CREDIT_CARD',
          userId: 'user-1',
          installmentGroupId: 'group-card',
          Date: new Date('2026-07-10T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          id: 'tx-card-2',
          installmentInfo: '2/2',
          paymentStatus: 'PENDING',
          installments: 2,
          paymentMethod: 'CREDIT_CARD',
          userId: 'user-1',
          installmentGroupId: 'group-card',
          Date: new Date('2026-08-10T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:01.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        { id: 'tx-card-1' },
        { id: 'tx-card-2' },
        { id: 'tx-card-3' },
        { id: 'tx-card-4' },
      ]);
    prismaMock.transation.update.mockImplementation(({ where, data }: any) =>
      Promise.resolve({ id: where.id, ...data }),
    );
    prismaMock.transation.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: data.installmentInfo, ...data }),
    );

    await service.updateInstallmentGroup('tx-card-1', 'user-1', {
      name: 'Notebook',
      amount: '1000.00',
      Date: '2026-09-10',
      installments: 4,
      paymentMethod: TransationPaymentMethod.CREDIT_CARD,
      cardId: 'card-1',
    } as any);

    expect(prismaMock.card.findFirst).toHaveBeenCalledWith({
      where: { id: 'card-1', userId: 'user-1' },
    });
    expect(prismaMock.transation.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.transation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'tx-card-2', paymentStatus: TransationPaymentStatus.PENDING }),
        data: expect.objectContaining({ installmentInfo: '2/5' }),
      }),
    );
    expect(prismaMock.transation.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.transation.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          installmentInfo: '3/5',
          cardId: 'card-1',
          nameCard: 'Nubank',
          paymentMethod: TransationPaymentMethod.CREDIT_CARD,
        }),
      }),
    );
  });

  it('should delete trailing parcels when installment count decreases', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-pix-10',
      userId: 'user-1',
      type: 'EXPENSE',
      category: 'OTHER',
      isFixed: false,
      withdrawal: 'DEPOSIT',
      installmentGroupId: 'pix-group',
      paymentMethod: TransationPaymentMethod.PIX,
      installments: 4,
    });
    prismaMock.transation.findMany
      .mockResolvedValueOnce([
        {
          id: 'tx-pix-1',
          paymentStatus: TransationPaymentStatus.PENDING,
          installmentInfo: '1/4',
          userId: 'user-1',
          installmentGroupId: 'pix-group',
          Date: new Date('2026-07-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          id: 'tx-pix-2',
          paymentStatus: TransationPaymentStatus.PENDING,
          installmentInfo: '2/4',
          userId: 'user-1',
          installmentGroupId: 'pix-group',
          Date: new Date('2026-08-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:01.000Z'),
        },
        {
          id: 'tx-pix-3',
          paymentStatus: TransationPaymentStatus.PENDING,
          installmentInfo: '3/4',
          userId: 'user-1',
          installmentGroupId: 'pix-group',
          Date: new Date('2026-09-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:02.000Z'),
        },
        {
          id: 'tx-pix-4',
          paymentStatus: TransationPaymentStatus.PENDING,
          installmentInfo: '4/4',
          userId: 'user-1',
          installmentGroupId: 'pix-group',
          Date: new Date('2026-10-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:03.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ id: 'tx-pix-1' }, { id: 'tx-pix-2' }]);
    prismaMock.transation.update.mockImplementation(({ where, data }: any) =>
      Promise.resolve({ id: where.id, ...data }),
    );
    prismaMock.transation.deleteMany.mockResolvedValue({ count: 2 });

    await service.updateInstallmentGroup('tx-pix-10', 'user-1', {
      name: 'Curso',
      amount: '500.00',
      Date: '2026-11-15',
      installments: 2,
      paymentMethod: TransationPaymentMethod.PIX,
    } as any);

    expect(prismaMock.transation.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        installmentGroupId: 'pix-group',
        paymentStatus: TransationPaymentStatus.PENDING,
        id: {
          in: ['tx-pix-3', 'tx-pix-4'],
        },
      },
    });
  });

  it('should clear card fields when switching from credit card to pix', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-switch-1',
      userId: 'user-1',
      type: 'EXPENSE',
      category: 'OTHER',
      isFixed: false,
      withdrawal: 'DEPOSIT',
      installmentGroupId: 'group-switch',
      paymentMethod: TransationPaymentMethod.CREDIT_CARD,
      installments: 2,
    });
    prismaMock.transation.findMany
      .mockResolvedValueOnce([
        {
          id: 'tx-switch-1',
          paymentStatus: TransationPaymentStatus.PENDING,
          installmentInfo: '1/2',
          userId: 'user-1',
          installmentGroupId: 'group-switch',
          Date: new Date('2026-07-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          id: 'tx-switch-2',
          paymentStatus: TransationPaymentStatus.PENDING,
          installmentInfo: '2/2',
          userId: 'user-1',
          installmentGroupId: 'group-switch',
          Date: new Date('2026-08-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:01.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ id: 'tx-switch-1' }, { id: 'tx-switch-2' }]);
    prismaMock.transation.update.mockImplementation(({ where, data }: any) =>
      Promise.resolve({ id: where.id, ...data }),
    );

    await service.updateInstallmentGroup('tx-switch-1', 'user-1', {
      name: 'Viagem',
      amount: '600.00',
      Date: '2026-12-20',
      installments: 2,
      paymentMethod: TransationPaymentMethod.PIX,
    } as any);

    expect(prismaMock.transation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'tx-switch-1' }),
        data: expect.objectContaining({
          paymentMethod: TransationPaymentMethod.PIX,
          cardId: null,
          nameCard: null,
        }),
      }),
    );
  });

  it('should delete a non-installment transaction directly', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-10',
      paymentMethod: TransationPaymentMethod.PIX,
      installments: 1,
      userId: 'user-1',
    });
    prismaMock.transation.delete.mockResolvedValue({ id: 'tx-10' });

    await expect(service.delete('tx-10', 'user-1')).resolves.toEqual({
      deletedCount: 1,
      deletedTransactionId: 'tx-10',
      preservedPaidCount: 0,
    });

    expect(prismaMock.transation.delete).toHaveBeenCalledWith({
      where: { id: 'tx-10' },
    });
  });

  it('should delete only pending installments from the same group', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-20',
      userId: 'user-1',
      name: 'Notebook',
      cardId: 'card-1',
      amount: 500,
      createdAt: new Date('2026-06-08T12:00:00.000Z'),
      installments: 3,
      installmentGroupId: 'group-1',
      paymentMethod: TransationPaymentMethod.CREDIT_CARD,
    });
    prismaMock.transation.deleteMany.mockResolvedValue({ count: 2 });

    await expect(service.delete('tx-20', 'user-1')).resolves.toEqual({
      deletedCount: 2,
      preservedPaidCount: 1,
    });

    expect(prismaMock.transation.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        installmentGroupId: 'group-1',
        paymentStatus: TransationPaymentStatus.PENDING,
      },
    });
    expect(prismaMock.transation.findMany).not.toHaveBeenCalled();
  });

  it('should delete only pending pix installments from the same group', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-pix-1',
      userId: 'user-1',
      name: 'Notebook',
      amount: 300,
      createdAt: new Date('2026-07-02T12:00:00.000Z'),
      installments: 3,
      installmentGroupId: 'pix-group-1',
      paymentMethod: TransationPaymentMethod.PIX,
    });
    prismaMock.transation.deleteMany.mockResolvedValue({ count: 2 });

    await expect(service.delete('tx-pix-1', 'user-1')).resolves.toEqual({
      deletedCount: 2,
      preservedPaidCount: 1,
    });

    expect(prismaMock.transation.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        installmentGroupId: 'pix-group-1',
        paymentStatus: TransationPaymentStatus.PENDING,
      },
    });
  });

  it('should preserve paid installments when no pending installment remains', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-30',
      userId: 'user-1',
      name: 'Curso',
      cardId: 'card-1',
      amount: 100,
      createdAt: new Date('2026-06-08T12:00:00.000Z'),
      installments: 2,
      installmentGroupId: 'group-2',
      paymentMethod: TransationPaymentMethod.CREDIT_CARD,
    });
    prismaMock.transation.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.delete('tx-30', 'user-1')).resolves.toEqual({
      deletedCount: 0,
      preservedPaidCount: 2,
    });

    expect(prismaMock.transation.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        installmentGroupId: 'group-2',
        paymentStatus: TransationPaymentStatus.PENDING,
      },
    });
  });

  it('should keep owner and pending status in the legacy installment deletion', async () => {
    const createdAt = new Date('2026-06-08T12:00:00.000Z');
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-legacy',
      userId: 'user-1',
      name: 'Notebook',
      cardId: 'card-1',
      amount: 50,
      createdAt,
      installments: 3,
      installmentGroupId: null,
      paymentMethod: TransationPaymentMethod.CREDIT_CARD,
    });
    prismaMock.transation.deleteMany.mockResolvedValue({ count: 2 });

    await expect(service.delete('tx-legacy', 'user-1')).resolves.toEqual({
      deletedCount: 2,
      preservedPaidCount: 1,
    });

    expect(prismaMock.transation.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        installmentGroupId: null,
        paymentMethod: TransationPaymentMethod.CREDIT_CARD,
        name: 'Notebook',
        cardId: 'card-1',
        amount: 50,
        installments: 3,
        createdAt: {
          gte: new Date(createdAt.getTime() - 60_000),
          lte: new Date(createdAt.getTime() + 60_000),
        },
        paymentStatus: TransationPaymentStatus.PENDING,
      },
    });
    expect(prismaMock.transation.findMany).not.toHaveBeenCalled();
  });

  it('should return only pending credit-card transactions for a selected card', async () => {
    prismaMock.transation.findMany.mockResolvedValue([
      { id: 'tx-pending-1', nameCard: 'Nubank', paymentStatus: TransationPaymentStatus.PENDING },
      { id: 'tx-pending-2', nameCard: '  nubank  ', paymentStatus: TransationPaymentStatus.PENDING },
      { id: 'tx-other', nameCard: 'Inter', paymentStatus: TransationPaymentStatus.PENDING },
    ]);

    await expect(
      service.findTransactionsByCard('user-1', 'Nubank'),
    ).resolves.toEqual([
      { id: 'tx-pending-1', nameCard: 'Nubank', paymentStatus: TransationPaymentStatus.PENDING },
      { id: 'tx-pending-2', nameCard: '  nubank  ', paymentStatus: TransationPaymentStatus.PENDING },
    ]);

    expect(prismaMock.transation.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: 'EXPENSE',
        paymentMethod: TransationPaymentMethod.CREDIT_CARD,
        paymentStatus: TransationPaymentStatus.PENDING,
      },
      orderBy: [{ Date: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('should aggregate credit-card spending with paid and pending transactions', async () => {
    prismaMock.transation.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        nameCard: 'Nubank',
        amount: 70,
        installments: 1,
        paymentStatus: TransationPaymentStatus.PAID,
        Date: new Date('2026-07-05T00:00:00.000Z'),
      },
      {
        id: 'tx-2',
        nameCard: 'Nubank',
        amount: 50,
        installments: 3,
        paymentStatus: TransationPaymentStatus.PENDING,
        Date: new Date('2026-07-01T00:00:00.000Z'),
      },
      {
        id: 'tx-3',
        nameCard: ' nubank ',
        amount: 180,
        installments: 3,
        paymentStatus: TransationPaymentStatus.PENDING,
        Date: new Date('2026-08-05T00:00:00.000Z'),
      },
      {
        id: 'tx-4',
        nameCard: 'Inter',
        amount: 80,
        installments: 0,
        paymentStatus: TransationPaymentStatus.PENDING,
        Date: new Date('2026-08-10T00:00:00.000Z'),
      },
      {
        id: 'tx-5',
        nameCard: 'C6',
        amount: 100,
        installments: 1,
        paymentStatus: TransationPaymentStatus.PAID,
        Date: new Date('2026-07-15T00:00:00.000Z'),
      },
    ]);

    await expect(
      service.getTopCreditCardsByMonth('user-1', '2026-07'),
    ).resolves.toEqual({
      topCredcards: [
        {
          card: 'Nubank',
          valorTotalMes: 120, // 70 (pago) + 50 (pendente) do mês 07
          valorTotalTodosMesesRestantes: 230, // 50 (07) + 180 (08) pendentes
          valorParceladoMes: 50,
        },
        {
          card: 'Inter',
          valorTotalMes: 0, // nenhuma em 07
          valorTotalTodosMesesRestantes: 80, // 80 (pendente) em 08
          valorParceladoMes: 0,
        },
        {
          card: 'C6',
          valorTotalMes: 100, // 100 (pago) do mês 07
          valorTotalTodosMesesRestantes: 0, // nenhuma pendente
          valorParceladoMes: 0,
        },
      ],
    });

    expect(prismaMock.transation.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: 'EXPENSE',
        paymentMethod: TransationPaymentMethod.CREDIT_CARD,
        OR: [
          { paymentStatus: TransationPaymentStatus.PENDING },
          { Date: { gte: new Date('2026-07-01T00:00:00.000Z'), lt: new Date('2026-08-01T00:00:00.000Z') } },
        ],
      },
      orderBy: [{ Date: 'asc' }, { createdAt: 'asc' }],
    });
  });
});
