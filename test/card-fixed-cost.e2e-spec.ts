import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { CardModule } from "../src/card/card.module";
import { FixedCostModule } from "../src/fixed-cost/fixed-cost.module";
import { PrismaService } from "../src/prisma-services/prisma.service";

// In-memory fake persistence. These tests exercise the real HTTP guard, pipe,
// controllers and services; they do not assert database constraints or races.
describe("Cards and fixed costs access (real HTTP, fake persistence)", () => {
  let app: INestApplication;
  let cookieA: string;
  let cookieB: string;
  let cards: any[];
  let costs: any[];
  let monthlys: any[];
  let transactions: any[];
  const filter = (rows: any[], where: Record<string, any> = {}) =>
    rows.filter((row) =>
      Object.entries(where).every(([key, value]) =>
        key === "fixedCost"
          ? costs.some(
              (cost) =>
                cost.id === row.fixedCostId && cost.userId === value.userId,
            )
          : row[key] === value || (value === null && row[key] === undefined),
      ),
    );
  const prisma = {
    card: {
      create: jest.fn(async ({ data }) => {
        const row = { id: `card-${cards.length + 1}`, ...data };
        cards.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }) => filter(cards, where)),
      findFirst: jest.fn(async ({ where }) => filter(cards, where)[0] ?? null),
      update: jest.fn(async ({ where, data }) => {
        const row = filter(cards, where)[0];
        if (!row) throw new Error("missing");
        Object.assign(row, data);
        return row;
      }),
      delete: jest.fn(async ({ where }) => {
        const row = filter(cards, where)[0];
        if (!row) throw new Error("missing");
        cards = cards.filter((item) => item !== row);
        return row;
      }),
    },
    fixedCost: {
      create: jest.fn(async ({ data }) => {
        const row = { id: `cost-${costs.length + 1}`, ...data };
        costs.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where, include }) =>
        filter(costs, where).map((row) =>
          include
            ? {
                ...row,
                monthlys: monthlys.filter(
                  (monthly) =>
                    monthly.fixedCostId === row.id &&
                    monthly.competence === include.monthlys.where.competence,
                ),
              }
            : row,
        ),
      ),
      findFirst: jest.fn(async ({ where }) => filter(costs, where)[0] ?? null),
      update: jest.fn(async ({ where, data }) => {
        const row = filter(costs, where)[0];
        if (!row) throw new Error("missing");
        Object.assign(row, data);
        return row;
      }),
      delete: jest.fn(async ({ where }) => {
        const row = filter(costs, where)[0];
        if (!row) throw new Error("missing");
        costs = costs.filter((item) => item !== row);
        return row;
      }),
    },
    fixedCostMonthly: {
      count: jest.fn(async ({ where }) => filter(monthlys, where).length),
      findUnique: jest.fn(
        async ({ where }) =>
          monthlys.find(
            (row) =>
              where.transactionId !== undefined
                ? row.transactionId === where.transactionId
                : row.fixedCostId === where.fixedCostId_competence.fixedCostId &&
                  row.competence === where.fixedCostId_competence.competence,
          ) ?? null,
      ),
      upsert: jest.fn(async ({ where, create, update }) => {
        const row = monthlys.find((item) => item.fixedCostId === where.fixedCostId_competence.fixedCostId && item.competence === where.fixedCostId_competence.competence);
        if (row) { Object.assign(row, update); return row; }
        const created = { id: `monthly-${monthlys.length + 1}`, transactionId: null, ...create };
        monthlys.push(created);
        return created;
      }),
      create: jest.fn(async ({ data }) => {
        const row = { id: `monthly-${monthlys.length + 1}`, ...data };
        monthlys.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = monthlys.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = filter(monthlys, where);
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
    },
    transation: {
      findMany: jest.fn(async ({ where, skip = 0, take }) =>
        filter(transactions, {
          cardId: where.cardId,
          userId: where.userId,
        }).slice(skip, take === undefined ? undefined : skip + take),
      ),
      count: jest.fn(async ({ where }) => filter(transactions, where).length),
    },
    $transaction: jest.fn(async (callback) => callback(prisma)),
  };
  const own = (path: string) =>
    request(app.getHttpServer()).get(path).set("Cookie", cookieA);
  const other = (path: string) =>
    request(app.getHttpServer()).get(path).set("Cookie", cookieB);
  const cardInput = {
    name: "Visa",
    invoiceDate: "2026-10-05",
    invoicePayment: "2026-10-15",
    limitBalance: "1000.00",
  };
  const costInput = {
    name: "Aluguel",
    defaultAmount: "500.00",
    category: "HOUSING",
    paymentMethod: "PIX",
    recurrence: "MONTHLY",
    startDate: "2026-10-01",
    dueDay: 10,
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = "card-cost-tests-only-secret";
    const module = await Test.createTestingModule({
      imports: [CardModule, FixedCostModule],
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
      { id: "card-a", userId: "user-a", ...cardInput },
      { id: "card-b", userId: "user-b", ...cardInput },
    ];
    costs = [
      {
        id: "cost-a",
        userId: "user-a",
        ...costInput,
        startDate: new Date("2026-10-01"),
        isActive: true,
      },
      {
        id: "cost-b",
        userId: "user-b",
        ...costInput,
        startDate: new Date("2026-10-01"),
        isActive: true,
      },
    ];
    monthlys = [];
    transactions = [];
  });

  it.each([
    ["get", "/cards"],
    ["post", "/cards"],
    ["get", "/cards/card-a"],
    ["patch", "/cards/card-a"],
    ["delete", "/cards/card-a"],
    ["get", "/cards/user/user-a"],
    ["get", "/cards/transation/card-a"],
    ["get", "/cards/transations/card-a"],
    ["get", "/fixed-costs"],
    ["post", "/fixed-costs"],
    ["get", "/fixed-costs/cost-a"],
    ["patch", "/fixed-costs/cost-a"],
    ["patch", "/fixed-costs/cost-a/monthly/2026-10"],
    ["delete", "/fixed-costs/cost-a"],
  ])("returns 401 without a session for %s %s", async (method, path) => {
    await request(app.getHttpServer())[method](path).send({}).expect(401);
  });

  it("scopes lists and monthly projection for both identities", async () => {
    expect((await own("/cards").expect(200)).body.map((row) => row.id)).toEqual(
      ["card-a"],
    );
    expect(
      (await other("/cards").expect(200)).body.map((row) => row.id),
    ).toEqual(["card-b"]);
    expect(
      (await own("/cards/user/user-a").expect(200)).body.data.map(
        (row) => row.id,
      ),
    ).toEqual(["card-a"]);
    await own("/cards/user/user-b").expect(403);
    expect(
      (await own("/fixed-costs").expect(200)).body.map((row) => row.id),
    ).toEqual(["cost-a"]);
    expect(
      (await other("/fixed-costs?userId=user-b").expect(200)).body.map(
        (row) => row.id,
      ),
    ).toEqual(["cost-b"]);
    expect(
      (await own("/fixed-costs?month=2026-10").expect(200)).body.data.map(
        (row) => row.id,
      ),
    ).toEqual(["cost-a"]);
    await own("/fixed-costs?userId=user-b&month=2026-10").expect(403);
    monthlys = [
      {
        id: "ma",
        fixedCostId: "cost-a",
        competence: "2026-10",
        status: "PAID",
        amount: "111.00",
      },
      {
        id: "mb",
        fixedCostId: "cost-b",
        competence: "2026-10",
        status: "PAID",
        amount: "222.00",
      },
    ];
    for (const [read, id, amount] of [
      [own, "cost-a", "111.00"],
      [other, "cost-b", "222.00"],
    ] as const) {
      const result = await read("/fixed-costs?month=2026-10").expect(200);
      expect(result.body.data).toHaveLength(1);
      expect(result.body.data[0]).toMatchObject({
        id,
        monthly: { amount, status: "PAID" },
      });
    }
  });

  it("rejects a divergent legacy owner and accepts the session owner", async () => {
    await request(app.getHttpServer()).post("/cards").set("Cookie", cookieA).send({ ...cardInput, userId: "user-b" }).expect(403);
    await request(app.getHttpServer()).post("/fixed-costs").set("Cookie", cookieA).send({ ...costInput, userId: "user-b" }).expect(403);
    await request(app.getHttpServer()).patch("/cards/card-a").set("Cookie", cookieA).send({ name: "Gold", userId: "user-b" }).expect(403);
    await request(app.getHttpServer()).patch("/fixed-costs/cost-a").set("Cookie", cookieA).send({ name: "Casa", userId: "user-b" }).expect(403);
    await request(app.getHttpServer())
      .post("/cards")
      .set("Cookie", cookieA)
      .send({ ...cardInput, userId: "user-a" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/fixed-costs")
      .set("Cookie", cookieA)
      .send({ ...costInput, userId: "user-a" })
      .expect(201);
    expect(cards.at(-1).userId).toBe("user-a");
    expect(costs.at(-1).userId).toBe("user-a");
    await request(app.getHttpServer())
      .patch("/cards/card-a")
      .set("Cookie", cookieA)
      .send({ name: "Gold", userId: "user-a" })
      .expect(200);
    await request(app.getHttpServer())
      .patch("/fixed-costs/cost-a")
      .set("Cookie", cookieA)
      .send({ name: "Casa", userId: "user-a" })
      .expect(200);
    expect(cards[0]).toMatchObject({ name: "Gold", userId: "user-a" });
    expect(costs[0]).toMatchObject({ name: "Casa", userId: "user-a" });
  });

  it.each([
    ["card-a", "cost-a", "user-b"],
    ["card-b", "cost-b", "user-a"],
  ])(
    "returns 404 on cross-account ID operations",
    async (cardId, costId, actingUser) => {
      const cookie = actingUser === "user-a" ? cookieA : cookieB;
      await request(app.getHttpServer())
        .get(`/cards/${cardId}`)
        .set("Cookie", cookie)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/cards/${cardId}`)
        .set("Cookie", cookie)
        .send({ name: "X" })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/cards/${cardId}`)
        .set("Cookie", cookie)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/fixed-costs/${costId}`)
        .set("Cookie", cookie)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/fixed-costs/${costId}`)
        .set("Cookie", cookie)
        .send({ name: "X" })
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/fixed-costs/${costId}/monthly/2026-10`)
        .set("Cookie", cookie)
        .send({ status: "PAID" })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/fixed-costs/${costId}`)
        .set("Cookie", cookie)
        .expect(404);
      expect(monthlys).toHaveLength(0);
    },
  );

  it("filters both card transaction routes and the count by transaction owner", async () => {
    transactions = [
      { id: "own", cardId: "card-a", userId: "user-a" },
      { id: "foreign", cardId: "card-a", userId: "user-b" },
    ];
    expect(
      (await own("/cards/transations/card-a").expect(200)).body.map(
        (row) => row.id,
      ),
    ).toEqual(["own"]);
    const page = await own(
      "/cards/transation/card-a?page=1&pageSize=10",
    ).expect(200);
    expect(page.body.transactions.map((row) => row.id)).toEqual(["own"]);
    expect(page.body.totalPages).toBe(1);
    expect(prisma.transation.count).toHaveBeenCalledWith({
      where: { cardId: "card-a", userId: "user-a" },
    });
    await other("/cards/transations/card-a").expect(404);
    await other("/cards/transation/card-a").expect(404);
  });

  it("preserves monthly history and dependent resources on 409", async () => {
    await request(app.getHttpServer())
      .patch("/fixed-costs/cost-a/monthly/2026-10")
      .set("Cookie", cookieA)
      .send({ status: "PAID" })
      .expect(200);
    transactions = [{ id: "foreign", cardId: "card-a", userId: "user-b" }];
    await request(app.getHttpServer())
      .delete("/cards/card-a")
      .set("Cookie", cookieA)
      .expect(409);
    await request(app.getHttpServer())
      .delete("/fixed-costs/cost-a")
      .set("Cookie", cookieA)
      .expect(409);
    expect(cards.some((row) => row.id === "card-a")).toBe(true);
    expect(costs.some((row) => row.id === "cost-a")).toBe(true);
    expect(monthlys).toHaveLength(1);
    await request(app.getHttpServer())
      .delete("/cards/card-b")
      .set("Cookie", cookieB)
      .expect(200);
    await request(app.getHttpServer())
      .delete("/fixed-costs/cost-b")
      .set("Cookie", cookieB)
      .expect(200);
  });

  it("rejects null fields and invalid pagination", async () => {
    await request(app.getHttpServer())
      .patch("/cards/card-a")
      .set("Cookie", cookieA)
      .send({ name: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch("/fixed-costs/cost-a")
      .set("Cookie", cookieA)
      .send({ dueDay: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch("/fixed-costs/cost-a/monthly/2026-10")
      .set("Cookie", cookieA)
      .send({ status: "PAID", amount: null })
      .expect(400);
    for (const query of [
      "page=0",
      "page=-1",
      "page=abc",
      "page=9007199254740991",
      "pageSize=101",
      "pageSize=1.5",
    ]) {
      await own(`/cards/transation/card-a?${query}`).expect(400);
    }
    await own("/cards/transation/card-a?date=not-a-date").expect(400);
    await own("/fixed-costs?month=invalid").expect(400);
  });
  it("reads own resources, rejects absent IDs and updates only own monthly rows", async () => {
    expect((await own("/cards/card-a").expect(200)).body.userId).toBe("user-a");
    expect((await other("/fixed-costs/cost-b").expect(200)).body.userId).toBe(
      "user-b",
    );
    await own("/cards/missing").expect(404);
    await own("/fixed-costs/missing").expect(404);
    await own("/cards/%20").expect(400);
    await own("/fixed-costs/%20").expect(400);
    monthlys = [
      {
        id: "ma",
        fixedCostId: "cost-a",
        competence: "2026-10",
        status: "PENDING",
        amount: "500.00",
      },
      {
        id: "mb",
        fixedCostId: "cost-b",
        competence: "2026-10",
        status: "PAID",
        amount: "700.00",
      },
    ];
    const originalB = { ...monthlys[1] };
    await request(app.getHttpServer())
      .patch("/fixed-costs/cost-b/monthly/2026-10")
      .set("Cookie", cookieA)
      .send({ status: "PENDING", amount: "1.00" })
      .expect(404);
    expect(monthlys[1]).toEqual(originalB);
    await request(app.getHttpServer())
      .patch("/fixed-costs/cost-a/monthly/2026-10")
      .set("Cookie", cookieA)
      .send({ status: "PAID", amount: "550.00" })
      .expect(200);
    expect(monthlys[0]).toMatchObject({ status: "PAID", amount: "550.00" });
    await request(app.getHttpServer())
      .patch("/fixed-costs/cost-a")
      .set("Cookie", cookieA)
      .send({ defaultAmount: "600.00" })
      .expect(200);
    expect(monthlys[0].amount).toBe("550.00");
    expect(monthlys[1]).toEqual(originalB);
    monthlys.push(
      {
        id: "ma-pending",
        fixedCostId: "cost-a",
        competence: "2026-11",
        status: "PENDING",
        amount: "500.00",
      },
      {
        id: "mb-pending",
        fixedCostId: "cost-b",
        competence: "2026-11",
        status: "PENDING",
        amount: "700.00",
      },
    );
    await request(app.getHttpServer())
      .patch("/fixed-costs/cost-a")
      .set("Cookie", cookieA)
      .send({ defaultAmount: "650.00" })
      .expect(200);
    expect(monthlys[2].amount).toBe("650.00");
    expect(monthlys[3].amount).toBe("700.00");
    expect(monthlys[0].amount).toBe("550.00");
  });
});
