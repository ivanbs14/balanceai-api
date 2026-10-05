import {
  FixedCostMonthlyStatus,
  PrismaClient,
  TransationPaymentMethod,
  TransationPaymentStatus,
  TransationType,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { FixedCostService } from "../fixed-cost/fixed-cost.service";
import { PrismaService } from "../prisma-services/prisma.service";
import { TransationService } from "./transation.service";

const databaseUrl = process.env.TECH015_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("financial summary in isolated PostgreSQL", () => {
  let prisma: PrismaClient;
  const suffix = randomUUID();
  const userId = `tech015-${suffix}`;

  beforeAll(async () => {
    const host = new URL(databaseUrl!).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") {
      throw new Error(
        "TECH015_DATABASE_URL must point to an isolated localhost database.",
      );
    }
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    await prisma.user.create({
      data: {
        id: userId,
        name: "Fictitious",
        document: suffix,
        email: `${suffix}@example.test`,
        password: "unused",
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.transation.deleteMany({ where: { userId } });
    await prisma.fixedCost.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("counts each source once and keeps paid and forecast amounts separate", async () => {
    const date = new Date("2026-07-05T12:00:00.000Z");
    const transactionBase = {
      userId,
      name: "Fictitious entry",
      category: "OTHER" as const,
      paymentMethod: TransationPaymentMethod.PIX,
      Date: date,
    };
    await prisma.transation.createMany({
      data: [
        { ...transactionBase, type: TransationType.DEPOSIT, amount: "1000.00" },
        {
          ...transactionBase,
          type: TransationType.INVESTMENT,
          amount: "200.00",
        },
        {
          ...transactionBase,
          type: TransationType.EXPENSE,
          amount: "100.00",
          category: "FOOD",
          withdrawal: TransationType.INVESTMENT,
          paymentStatus: TransationPaymentStatus.PAID,
        },
        {
          ...transactionBase,
          type: TransationType.EXPENSE,
          amount: "30.00",
          category: "UTILITY",
          withdrawal: TransationType.DEPOSIT,
          paymentStatus: TransationPaymentStatus.PENDING,
        },
      ],
    });
    const paidFixed = await prisma.fixedCost.create({
      data: {
        userId,
        name: "Rent",
        defaultAmount: "50.00",
        category: "HOUSING",
        paymentMethod: TransationPaymentMethod.PIX,
        startDate: date,
        dueDay: 5,
      },
    });
    const pendingFixed = await prisma.fixedCost.create({
      data: {
        userId,
        name: "Power",
        defaultAmount: "25.00",
        category: "UTILITY",
        paymentMethod: TransationPaymentMethod.PIX,
        startDate: date,
        dueDay: 5,
      },
    });
    await prisma.fixedCostMonthly.createMany({
      data: [
        {
          fixedCostId: paidFixed.id,
          competence: "2026-07",
          status: FixedCostMonthlyStatus.PAID,
          amount: "50.00",
        },
        {
          fixedCostId: pendingFixed.id,
          competence: "2026-07",
          status: FixedCostMonthlyStatus.PENDING,
          amount: "25.00",
        },
      ],
    });

    const prismaService = prisma as unknown as PrismaService;
    const service = new TransationService(
      prismaService,
      new FixedCostService(prismaService),
    );
    const monthly = await service.getAllBalance(userId, "2026-07");
    const annual = await service.getAllBalance(userId, "2026");

    expect(monthly.totalValues).toMatchObject({
      realizedExpenses: 150,
      forecastExpenses: 55,
      investedPosition: 100,
      balance: 750,
      projectedBalance: 695,
    });
    expect(monthly.topCategories).toEqual([
      { category: "FOOD", percent: 66.7, value: 100 },
      { category: "HOUSING", percent: 33.3, value: 50 },
    ]);
    expect(monthly.anualBalance[0].value).toBe(750);
    expect(annual.totalValues).toMatchObject({
      realizedExpenses: 150,
      forecastExpenses: 430,
      balance: 750,
    });
    expect(annual.anualBalance[0].value).toBe(750);
  });
});
