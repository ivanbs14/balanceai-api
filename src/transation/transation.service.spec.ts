/* eslint-disable prettier/prettier */
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (callback: any) => callback(prismaMock)),
  } as any;

  const fixedCostServiceMock = {
    findByUserIdAndMonth: jest.fn(),
  } as any;

  let service: TransationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TransationService(prismaMock, fixedCostServiceMock);
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
      amount: '900.00',
      category: 'OTHER',
      paymentMethod: TransationPaymentMethod.PIX,
      installments: 3,
      Date: '2026-07-02',
      withdrawal: 'DEPOSIT',
    } as any);

    expect(Array.isArray(result)).toBe(true);
    expect(prismaMock.transation.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.transation.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMethod: TransationPaymentMethod.PIX,
          amount: 300,
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
    prismaMock.card.findUnique.mockResolvedValue({ id: 'card-1', name: 'Nubank' });
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

    expect(prismaMock.card.findUnique).toHaveBeenCalledWith({
      where: { id: 'card-1' },
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

  it('should edit an installment group and recalculate all parcels', async () => {
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
      amount: '1200.00',
      Date: '2026-10-05',
      installments: 3,
      paymentMethod: TransationPaymentMethod.PIX,
    } as any);

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.transation.update).toHaveBeenCalledTimes(3);
    expect(prismaMock.transation.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'tx-group-1' },
        data: expect.objectContaining({
          name: 'Notebook Pro',
          amount: 400,
          installments: 3,
          installmentInfo: '1/3',
          paymentMethod: TransationPaymentMethod.PIX,
          cardId: null,
          nameCard: null,
          Date: new Date('2026-10-05T00:00:00.000Z'),
        }),
      }),
    );
    expect(prismaMock.transation.update).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: { id: 'tx-group-3' },
        data: expect.objectContaining({
          installmentInfo: '3/3',
          Date: new Date('2026-12-05T00:00:00.000Z'),
        }),
      }),
    );
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
    prismaMock.card.findUnique.mockResolvedValue({ id: 'card-1', name: 'Nubank' });
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

    expect(prismaMock.card.findUnique).toHaveBeenCalledWith({
      where: { id: 'card-1' },
    });
    expect(prismaMock.transation.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.transation.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          installmentInfo: '3/4',
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
          installmentInfo: '1/4',
          userId: 'user-1',
          installmentGroupId: 'pix-group',
          Date: new Date('2026-07-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          id: 'tx-pix-2',
          installmentInfo: '2/4',
          userId: 'user-1',
          installmentGroupId: 'pix-group',
          Date: new Date('2026-08-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:01.000Z'),
        },
        {
          id: 'tx-pix-3',
          installmentInfo: '3/4',
          userId: 'user-1',
          installmentGroupId: 'pix-group',
          Date: new Date('2026-09-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:02.000Z'),
        },
        {
          id: 'tx-pix-4',
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
          installmentInfo: '1/2',
          userId: 'user-1',
          installmentGroupId: 'group-switch',
          Date: new Date('2026-07-02T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          id: 'tx-switch-2',
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

    expect(prismaMock.transation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-switch-1' },
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
    prismaMock.transation.findMany.mockResolvedValue([{ id: 'tx-20' }, { id: 'tx-22' }]);
    prismaMock.transation.deleteMany.mockResolvedValue({ count: 2 });

    await expect(service.delete('tx-20', 'user-1')).resolves.toEqual({
      deletedCount: 2,
      preservedPaidCount: 1,
    });

    expect(prismaMock.transation.findMany).toHaveBeenCalledWith({
      where: {
        installmentGroupId: 'group-1',
        paymentStatus: TransationPaymentStatus.PENDING,
      },
      select: { id: true },
    });
    expect(prismaMock.transation.deleteMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['tx-20', 'tx-22'],
        },
      },
    });
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
    prismaMock.transation.findMany.mockResolvedValue([{ id: 'tx-pix-1' }, { id: 'tx-pix-2' }]);
    prismaMock.transation.deleteMany.mockResolvedValue({ count: 2 });

    await expect(service.delete('tx-pix-1', 'user-1')).resolves.toEqual({
      deletedCount: 2,
      preservedPaidCount: 1,
    });

    expect(prismaMock.transation.findMany).toHaveBeenCalledWith({
      where: {
        installmentGroupId: 'pix-group-1',
        paymentStatus: TransationPaymentStatus.PENDING,
      },
      select: { id: true },
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
    prismaMock.transation.findMany.mockResolvedValue([]);

    await expect(service.delete('tx-30', 'user-1')).resolves.toEqual({
      deletedCount: 0,
      preservedPaidCount: 2,
    });

    expect(prismaMock.transation.deleteMany).not.toHaveBeenCalled();
  });

  it('should return only pending credit-card transactions for a selected card', async () => {
    prismaMock.transation.findMany.mockResolvedValue([
      { id: 'tx-pending-1', nameCard: 'Nubank', paymentStatus: TransationPaymentStatus.PENDING },
    ]);

    await expect(
      service.findTransactionsByCard('user-1', 'Nubank'),
    ).resolves.toEqual([
      { id: 'tx-pending-1', nameCard: 'Nubank', paymentStatus: TransationPaymentStatus.PENDING },
    ]);

    expect(prismaMock.transation.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: 'EXPENSE',
        paymentMethod: TransationPaymentMethod.CREDIT_CARD,
        paymentStatus: TransationPaymentStatus.PENDING,
        nameCard: {
          equals: 'Nubank',
          mode: 'insensitive',
        },
      },
      orderBy: [{ Date: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('should aggregate credit-card card spending using pending totals only', async () => {
    prismaMock.transation.groupBy.mockResolvedValue([
      {
        nameCard: 'Nubank',
        _sum: { amount: 120 },
      },
      {
        nameCard: 'Inter',
        _sum: { amount: 80 },
      },
    ]);
    prismaMock.transation.aggregate.mockImplementation(({ where }: any) => {
      if (where.nameCard === 'Nubank' && where.installments) {
        return Promise.resolve({ _sum: { amount: 50 } });
      }

      if (where.nameCard === 'Nubank') {
        return Promise.resolve({ _sum: { amount: 300 } });
      }

      if (where.nameCard === 'Inter' && where.installments) {
        return Promise.resolve({ _sum: { amount: 0 } });
      }

      return Promise.resolve({ _sum: { amount: 80 } });
    });

    await expect(
      service.getTopCreditCardsByMonth('user-1', '2026-07'),
    ).resolves.toEqual({
      topCredcards: [
        {
          card: 'Nubank',
          valorTotalMes: 120,
          valorTotalTodosMesesRestantes: 300,
          valorParceladoMes: 50,
        },
        {
          card: 'Inter',
          valorTotalMes: 80,
          valorTotalTodosMesesRestantes: 80,
          valorParceladoMes: 0,
        },
      ],
    });

    expect(prismaMock.transation.groupBy).toHaveBeenCalledWith({
      by: ['nameCard'],
      _sum: { amount: true },
      where: expect.objectContaining({
        userId: 'user-1',
        type: 'EXPENSE',
        paymentMethod: 'CREDIT_CARD',
        paymentStatus: TransationPaymentStatus.PENDING,
      }),
    });
    expect(prismaMock.transation.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        _sum: { amount: true },
        where: expect.objectContaining({
          userId: 'user-1',
          type: 'EXPENSE',
          paymentMethod: 'CREDIT_CARD',
          paymentStatus: TransationPaymentStatus.PENDING,
          nameCard: 'Nubank',
        }),
      }),
    );
  });
});
