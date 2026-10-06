/* eslint-disable prettier/prettier */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { CookieAuthGuard } from '../src/auth/cookie-auth.guard';
import { FixedCostService } from '../src/fixed-cost/fixed-cost.service';
import { PrismaService } from '../src/prisma-services/prisma.service';
import { TransationController } from '../src/transation/transation.controller';
import { TransationService } from '../src/transation/transation.service';
import { TransationPaymentMethod } from '@prisma/client';

describe('TransationController (e2e)', () => {
  let app: INestApplication;

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
    fixedCostMonthly: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(async (callback: any) => callback(prismaMock)),
  } as any;

  const fixedCostServiceMock = {
    findByUserIdAndMonth: jest.fn(),
  };
  const cookieAuthGuardMock = {
    canActivate: jest.fn((context) => {
      const request = context.switchToHttp().getRequest();
      request.user = { userId: 'user-1', email: 'user-1@test.com', role: 'user' };
      return true;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleBuilder = Test.createTestingModule({
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
    });
    moduleBuilder.overrideGuard(CookieAuthGuard).useValue(cookieAuthGuardMock);

    const moduleFixture: TestingModule = await moduleBuilder.compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('PATCH /transations/:id/payment-status should persist PAID status', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({ id: 'tx-1', userId: 'user-1' });
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
          userId: 'user-1',
          paymentStatus: 'PAID',
        }),
      }),
    );
  });

  it('GET /transations/open-by-card/:nameCard should return only normalized pending card transactions', async () => {
    const rows = [
      { id: 'tx-pending', nameCard: 'Nubank', paymentStatus: 'PENDING' },
      { id: 'tx-pending-2', nameCard: ' nubank ', paymentStatus: 'PENDING' },
      { id: 'tx-paid', nameCard: 'Nubank', paymentStatus: 'PAID' },
      { id: 'tx-other', nameCard: 'Inter', paymentStatus: 'PENDING' },
    ];
    prismaMock.transation.findMany.mockImplementation(({ where }) =>
      Promise.resolve(rows.filter((row) => row.paymentStatus === where.paymentStatus)),
    );

    await request(app.getHttpServer())
      .get('/transations/open-by-card/Nubank')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          { id: 'tx-pending', nameCard: 'Nubank', paymentStatus: 'PENDING' },
          { id: 'tx-pending-2', nameCard: ' nubank ', paymentStatus: 'PENDING' },
        ]);
      });

    expect(prismaMock.transation.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: 'EXPENSE',
        paymentMethod: TransationPaymentMethod.CREDIT_CARD,
        paymentStatus: 'PENDING',
      },
      orderBy: [{ Date: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('POST /transations should create a deposit for the authenticated user', async () => {
    prismaMock.transation.create.mockResolvedValue({
      id: 'tx-new',
      userId: 'user-1',
      name: 'Salario',
      type: 'DEPOSIT',
    });

    await request(app.getHttpServer())
      .post('/transations')
      .send({
        userId: 'user-1',
        name: 'Salario',
        type: 'DEPOSIT',
        amount: '1500.00',
        category: 'SALARY',
        paymentMethod: 'PIX',
        installments: 1,
        Date: '2026-06-08',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.userId).toBe('user-1');
      });

    expect(prismaMock.transation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        name: 'Salario',
      }),
    });
  });

  it('rejects divergent legacy owner, invalid money and abusive pagination', async () => {
    const payload = { name: 'Salario', type: 'DEPOSIT', amount: '1500.00', category: 'SALARY', paymentMethod: 'PIX', Date: '2026-06-08' };
    await request(app.getHttpServer()).post('/transations').send({ ...payload, userId: 'user-2' }).expect(403);
    for (const amount of ['0.00', '-1.00', '100000000.00']) {
      await request(app.getHttpServer()).post('/transations').send({ ...payload, amount }).expect(400);
    }
    await request(app.getHttpServer()).get('/transations/user/user-2/2026-06').expect(403);
    await request(app.getHttpServer()).get('/transations/user/user-1/2026-06?pageSize=101').expect(400);
    await request(app.getHttpServer()).get('/transations/user/user-1/2026-13').expect(400);
    expect(prismaMock.transation.create).not.toHaveBeenCalled();
  });

  it('POST /transations should create an investment for the authenticated user', async () => {
    prismaMock.transation.create.mockResolvedValue({
      id: 'tx-invest',
      userId: 'user-1',
      name: 'Tesouro Selic',
      type: 'INVESTMENT',
    });

    await request(app.getHttpServer())
      .post('/transations')
      .send({
        userId: 'user-1',
        name: 'Tesouro Selic',
        type: 'INVESTMENT',
        amount: '350.00',
        category: 'OTHER',
        paymentMethod: 'Bank_Transfer',
        Date: '2026-06-08',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.userId).toBe('user-1');
        expect(response.body.type).toBe('INVESTMENT');
      });

    expect(prismaMock.transation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        name: 'Tesouro Selic',
        type: 'INVESTMENT',
      }),
    });
  });

  it('PUT /transations/:id should reject editing a paid transaction', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-paid',
      userId: 'user-1',
      paymentMethod: TransationPaymentMethod.PIX,
      paymentStatus: 'PAID',
      installments: 1,
    });

    await request(app.getHttpServer())
      .put('/transations/tx-paid')
      .send({
        name: 'Mercado',
        amount: '100.00',
      })
      .expect(400);
  });

  it('DELETE /transations/:id should delete only pending installments for credit card purchases', async () => {
    prismaMock.transation.findUnique.mockResolvedValue({
      id: 'tx-1',
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

    await request(app.getHttpServer())
      .delete('/transations/tx-1')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          deletedCount: 2,
          preservedPaidCount: 1,
        });
      });
    expect(prismaMock.transation.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        installmentGroupId: 'group-1',
        paymentStatus: 'PENDING',
      },
    });
  });
});
