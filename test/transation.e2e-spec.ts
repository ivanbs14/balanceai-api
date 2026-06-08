/* eslint-disable prettier/prettier */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { FixedCostService } from '../src/fixed-cost/fixed-cost.service';
import { PrismaService } from '../src/prisma-services/prisma.service';
import { TransationController } from '../src/transation/transation.controller';
import { TransationService } from '../src/transation/transation.service';

describe('TransationController (e2e)', () => {
  let app: INestApplication;

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
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TransationController],
      providers: [
        TransationService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: FixedCostService,
          useValue: fixedCostServiceMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('PATCH /transations/:id/payment-status should persist PAID status', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({ id: 'tx-1' });
    prismaMock.transation.update.mockResolvedValue({
      id: 'tx-1',
      paymentStatus: 'PAID',
      paidAt: '2026-06-08T12:00:00.000Z',
    });

    await request(app.getHttpServer())
      .patch('/transations/tx-1/payment-status')
      .send({ paymentStatus: 'PAID' })
      .expect(200)
      .expect((response) => {
        expect(response.body.paymentStatus).toBe('PAID');
      });
  });

  it('PATCH /transations/:id/payment-status should return 404 when transaction does not exist', async () => {
    prismaMock.transation.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .patch('/transations/tx-missing/payment-status')
      .send({ paymentStatus: 'PAID' })
      .expect(404);
  });

  it('GET /transations/user/:userId/:month should support paymentStatus filter', async () => {
    prismaMock.transation.findMany.mockResolvedValue([]);
    prismaMock.transation.count.mockResolvedValue(0);

    await request(app.getHttpServer())
      .get('/transations/user/user-1/2026-06')
      .query({ page: 1, pageSize: 10, paymentStatus: 'PAID' })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          transactions: [],
          totalPages: 0,
          currentPage: 1,
          pageSize: 10,
        });
      });

    expect(prismaMock.transation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentStatus: 'PAID',
        }),
      }),
    );
  });
});
