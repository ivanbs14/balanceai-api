/* eslint-disable prettier/prettier */
import { NotFoundException } from '@nestjs/common';
import { TransationPaymentMethod, TransationPaymentStatus } from '@prisma/client';
import { TransationService } from './transation.service';

describe('TransationService', () => {
  const prismaMock = {
    transation: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    card: {
      findUnique: jest.fn(),
    },
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

  it('should return open credit-card transactions for a selected card', async () => {
    prismaMock.transation.findMany.mockResolvedValue([
      { id: 'tx-open-1', nameCard: 'Nubank' },
    ]);

    await expect(
      service.findOpenTransactionsByCard('user-1', 'Nubank'),
    ).resolves.toEqual([{ id: 'tx-open-1', nameCard: 'Nubank' }]);

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
});
