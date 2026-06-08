/* eslint-disable prettier/prettier */
import { NotFoundException } from '@nestjs/common';
import { TransationPaymentStatus } from '@prisma/client';
import { TransationService } from './transation.service';

describe('TransationService', () => {
  const prismaMock = {
    transation: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
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

  it('should mark transaction as PAID and set paidAt when paidAt is not provided', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({ id: 'tx-1' });
    prismaMock.transation.update.mockResolvedValue({
      id: 'tx-1',
      paymentStatus: 'PAID',
      paidAt: new Date(),
    });

    await service.updatePaymentStatus('tx-1', {
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
    prismaMock.transation.findUnique.mockResolvedValue({ id: 'tx-2' });
    prismaMock.transation.update.mockResolvedValue({
      id: 'tx-2',
      paymentStatus: 'PENDING',
      paidAt: null,
    });

    await service.updatePaymentStatus('tx-2', {
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
      service.updatePaymentStatus('tx-missing', {
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
});
