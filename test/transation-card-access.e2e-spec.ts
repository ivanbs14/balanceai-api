import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { PrismaService } from "../src/prisma-services/prisma.service";
import { TransationModule } from "../src/transation/transation.module";

// Real HTTP guard/pipe and controller/service, with in-memory persistence.
describe("Transaction card ownership (HTTP, fake persistence)", () => {
  let app: INestApplication;
  let cookieA: string;
  let cookieB: string;
  let cards: { id: string; userId: string; name: string }[];
  let transactions: any[];

  const matches = (row: Record<string, any>, where: Record<string, any>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  const prisma = {
    card: {
      findFirst: jest.fn(
        async ({ where }) => cards.find((card) => matches(card, where)) ?? null,
      ),
    },
    transation: {
      create: jest.fn(async ({ data }) => {
        const row = { id: `tx-${transactions.length + 1}`, ...data };
        transactions.push(row);
        return row;
      }),
      findUnique: jest.fn(
        async ({ where }) =>
          transactions.find((transaction) => matches(transaction, where)) ??
          null,
      ),
      findMany: jest.fn(async ({ where }) =>
        transactions.filter((transaction) => matches(transaction, where)),
      ),
      update: jest.fn(async ({ where, data }) => {
        const row = transactions.find((transaction) =>
          matches(transaction, where),
        );
        if (!row) throw new Error("Transaction missing in fake persistence");
        Object.assign(row, data);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }) => {
        const ids: string[] = where.id.in;
        const before = transactions.length;
        transactions = transactions.filter(
          (transaction) => !ids.includes(transaction.id),
        );
        return { count: before - transactions.length };
      }),
    },
    $transaction: jest.fn(async (callback) => callback(prisma)),
  };

  const expense = (overrides: Record<string, unknown> = {}) => ({
    userId: "user-b", // Forged owner must not affect the session identity.
    name: "Notebook",
    type: "EXPENSE",
    amount: "120.00",
    category: "OTHER",
    paymentMethod: "CREDIT_CARD",
    installments: 1,
    cardId: "card-a",
    Date: "2026-10-02",
    withdrawal: "DEPOSIT",
    ...overrides,
  });

  beforeAll(async () => {
    process.env.JWT_SECRET = "transaction-card-test-secret";
    const module = await Test.createTestingModule({
      imports: [TransationModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    const jwt = module.get(JwtService);
    cookieA = `balance_auth=${jwt.sign({ userId: "user-a", email: "a@test.com", role: "user" })}`;
    cookieB = `balance_auth=${jwt.sign({ userId: "user-b", email: "b@test.com", role: "user" })}`;
  });

  afterAll(async () => app?.close());

  beforeEach(() => {
    jest.clearAllMocks();
    cards = [
      { id: "card-a", userId: "user-a", name: "Cartão A" },
      { id: "card-b", userId: "user-b", name: "Cartão B" },
    ];
    transactions = [];
  });

  it("requires a session before creating or editing transactions", async () => {
    await request(app.getHttpServer())
      .post("/transations")
      .send(expense())
      .expect(401);
    await request(app.getHttpServer())
      .patch("/transations/tx-1/installment-group")
      .send({})
      .expect(401);
    expect(transactions).toHaveLength(0);
  });

  it("creates only with an owned card and uses its persisted name", async () => {
    await request(app.getHttpServer())
      .post("/transations")
      .set("Cookie", cookieA)
      .send(expense({ nameCard: "Forged name" }))
      .expect(201);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      userId: "user-a",
      cardId: "card-a",
      nameCard: "Cartão A",
    });
    expect(prisma.card.findFirst).toHaveBeenCalledWith({
      where: { id: "card-a", userId: "user-a" },
    });
  });

  it("rejects a foreign, unknown, or absent credit card before any write", async () => {
    const failures: { status: number; body: { message: string } }[] = [];
    for (const payload of [
      expense({ cardId: "card-b" }),
      expense({ cardId: "missing-card" }),
      expense({ cardId: undefined }),
      expense({ cardId: 12 }),
    ]) {
      const response = await request(app.getHttpServer())
        .post("/transations")
        .set("Cookie", cookieA)
        .send(payload)
        .expect(400);
      failures.push(response);
    }
    expect(failures[0].body.message).toBe(failures[1].body.message);
    expect(transactions).toHaveLength(0);
    expect(prisma.transation.create).not.toHaveBeenCalled();
  });

  it("rejects the other direction of cross-account card association", async () => {
    await request(app.getHttpServer())
      .post("/transations")
      .set("Cookie", cookieB)
      .send(expense({ cardId: "card-a" }))
      .expect(400);
    expect(transactions).toHaveLength(0);
  });

  it("rejects a card ID on non-credit payments and clears spoofed card names", async () => {
    for (const cardId of ["card-b", null]) {
      await request(app.getHttpServer())
        .post("/transations")
        .set("Cookie", cookieA)
        .send(expense({ paymentMethod: "PIX", cardId }))
        .expect(400);
    }
    expect(transactions).toHaveLength(0);

    await request(app.getHttpServer())
      .post("/transations")
      .set("Cookie", cookieA)
      .send(
        expense({
          paymentMethod: "PIX",
          cardId: undefined,
          nameCard: "Forged name",
        }),
      )
      .expect(201);
    expect(transactions[0]).toMatchObject({ cardId: null, nameCard: null });
  });

  it("checks card ownership before modifying an installment group", async () => {
    await request(app.getHttpServer())
      .post("/transations")
      .set("Cookie", cookieA)
      .send(expense({ installments: 2 }))
      .expect(201);
    expect(transactions).toHaveLength(2);
    const groupId = transactions[0].id;
    const update = {
      name: "Notebook editado",
      amount: "120.00",
      Date: "2026-10-02",
      installments: 2,
      paymentMethod: "CREDIT_CARD",
      cardId: "card-b",
    };
    const before = JSON.stringify(transactions);
    for (const cardId of ["card-b", "missing-card", undefined]) {
      await request(app.getHttpServer())
        .patch(`/transations/${groupId}/installment-group`)
        .set("Cookie", cookieA)
        .send({ ...update, cardId })
        .expect(400);
    }
    expect(JSON.stringify(transactions)).toBe(before);
    expect(prisma.transation.update).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .patch(`/transations/${groupId}/installment-group`)
      .set("Cookie", cookieA)
      .send({ ...update, paymentMethod: "PIX" })
      .expect(400);
    expect(JSON.stringify(transactions)).toBe(before);

    await request(app.getHttpServer())
      .patch(`/transations/${groupId}/installment-group`)
      .set("Cookie", cookieB)
      .send({ ...update, cardId: "card-b" })
      .expect(404);
    expect(JSON.stringify(transactions)).toBe(before);

    await request(app.getHttpServer())
      .patch(`/transations/${groupId}/installment-group`)
      .set("Cookie", cookieA)
      .send({ ...update, cardId: "card-a", nameCard: "Forged name" })
      .expect(200);
    expect(transactions).toHaveLength(2);
    expect(
      transactions.every(
        (transaction) =>
          transaction.cardId === "card-a" &&
          transaction.nameCard === "Cartão A",
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .patch(`/transations/${groupId}/installment-group`)
      .set("Cookie", cookieA)
      .send({ ...update, paymentMethod: "PIX", cardId: undefined })
      .expect(200);
    expect(
      transactions.every(
        (transaction) =>
          transaction.paymentMethod === "PIX" &&
          transaction.cardId === null &&
          transaction.nameCard === null,
      ),
    ).toBe(true);
  });
});
