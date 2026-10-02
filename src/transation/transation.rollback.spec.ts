import { PrismaClient, TransationPaymentMethod } from "@prisma/client";
import { FixedCostService } from "../fixed-cost/fixed-cost.service";
import { PrismaService } from "../prisma-services/prisma.service";
import { TransationService } from "./transation.service";

const databaseUrl = process.env.TECH008_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("installment creation in isolated PostgreSQL", () => {
  let prisma: PrismaClient;
  let service: TransationService;
  const rollbackName = `TECH008_ROLLBACK_${Date.now()}`;
  const successName = `TECH008_SUCCESS_${Date.now()}`;

  beforeAll(async () => {
    const host = new URL(databaseUrl!).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") {
      throw new Error(
        "TECH008_DATABASE_URL must point to an isolated localhost database.",
      );
    }

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    service = new TransationService(
      prisma as PrismaService,
      {} as FixedCostService,
    );
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION tech008_reject_second() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.name LIKE 'TECH008_ROLLBACK_%' AND NEW."installmentInfo" = '2/3' THEN
          RAISE EXCEPTION 'injected second installment failure';
        END IF;
        RETURN NEW;
      END $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER tech008_reject_second_trigger
      BEFORE INSERT ON "Transation"
      FOR EACH ROW EXECUTE FUNCTION tech008_reject_second()
    `);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS tech008_reject_second_trigger ON "Transation"',
    );
    await prisma.$executeRawUnsafe(
      "DROP FUNCTION IF EXISTS tech008_reject_second()",
    );
    await prisma.transation.deleteMany({
      where: { name: { in: [rollbackName, successName] } },
    });
    await prisma.$disconnect();
  });

  const purchase = (name: string) => ({
    userId: "tech008-test-user",
    name,
    type: "EXPENSE" as const,
    amount: "100.00",
    category: "OTHER" as const,
    paymentMethod: TransationPaymentMethod.PIX,
    installments: 3,
    Date: "2026-10-02",
    withdrawal: "DEPOSIT" as const,
  });

  it("rolls back the first insert when the second fails", async () => {
    await expect(service.create(purchase(rollbackName))).rejects.toThrow();
    expect(
      await prisma.transation.count({ where: { name: rollbackName } }),
    ).toBe(0);
  });

  it("stores exact cents and an ordered response when all inserts succeed", async () => {
    const created = await service.create(purchase(successName));
    expect(Array.isArray(created)).toBe(true);
    if (!Array.isArray(created)) throw new Error("Expected a group response.");
    expect(created.map((row) => row.amount.toFixed(2))).toEqual([
      "33.34",
      "33.33",
      "33.33",
    ]);
    const stored = await prisma.transation.findMany({
      where: { name: successName },
    });
    expect(stored).toHaveLength(3);
    expect(
      stored
        .reduce((total, row) => total.plus(row.amount), stored[0].amount.mul(0))
        .toFixed(2),
    ).toBe("100.00");
  });
});
