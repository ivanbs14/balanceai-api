import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl)
  throw new Error("TEST_DATABASE_URL é obrigatória para o importador.");
const parsed = new URL(testUrl);
if (
  !parsed.pathname.endsWith("_test") ||
  !["127.0.0.1", "localhost", "postgres"].includes(parsed.hostname)
) {
  throw new Error("O importador só pode usar PostgreSQL de teste isolado.");
}
if (process.env.DATABASE_URL !== testUrl)
  throw new Error("DATABASE_URL deve ser igual a TEST_DATABASE_URL.");

describe("importador bkpcsv em PostgreSQL isolado", () => {
  const prisma = new PrismaClient();
  const userId = randomUUID();
  const fixedCostId = randomUUID();

  const run = (...flags: string[]) =>
    execFileSync(
      process.execPath,
      [
        "-r",
        "ts-node/register",
        "prisma/import-bkpcsv.ts",
        `--path=${resolve("test/fixtures/import")}`,
        `--user-id=${userId}`,
        ...flags,
      ],
      {
        cwd: resolve("."),
        env: { ...process.env, DATABASE_URL: testUrl },
        encoding: "utf8",
        stdio: "pipe",
      },
    );

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: {
        id: userId,
        name: "Importador fictício",
        email: `${userId}@example.test`,
        role: "user",
      },
    });
  });

  afterAll(async () => {
    await prisma.fixedCostMonthly.deleteMany({ where: { fixedCostId } });
    await prisma.transation.deleteMany({ where: { userId } });
    await prisma.fixedCost.deleteMany({ where: { id: fixedCostId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("simula, deduplica, substitui e repara sem alterar dados no dry run", async () => {
    run("--dry-run");
    expect(await prisma.transation.count({ where: { userId } })).toBe(0);

    run();
    expect(await prisma.transation.count({ where: { userId } })).toBe(1);
    run();
    expect(await prisma.transation.count({ where: { userId } })).toBe(1);

    run("--sync-user");
    const row = await prisma.transation.findFirstOrThrow({ where: { userId } });
    expect(row.Date.toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(row.isFixed).toBe(true);

    await prisma.transation.update({
      where: { id: row.id },
      data: { isFixed: false },
    });
    run("--repair-fixed", "--dry-run");
    expect(
      (await prisma.transation.findUniqueOrThrow({ where: { id: row.id } }))
        .isFixed,
    ).toBe(false);
    run("--repair-fixed");
    expect(
      (await prisma.transation.findUniqueOrThrow({ where: { id: row.id } }))
        .isFixed,
    ).toBe(true);

    await prisma.fixedCost.create({
      data: {
        id: fixedCostId,
        userId,
        name: "Conta fictícia",
        defaultAmount: "100.00",
        category: "UTILITY",
        paymentMethod: "PIX",
        recurrence: "MONTHLY",
        startDate: new Date("2026-10-01T00:00:00.000Z"),
        dueDay: 15,
      },
    });
    await prisma.fixedCostMonthly.create({
      data: {
        fixedCostId,
        competence: "2026-10",
        status: "PENDING",
        amount: "100.00",
        transactionId: row.id,
      },
    });
    expect(() => run("--sync-user")).toThrow(/sync-user recusado/);
    expect(await prisma.transation.count({ where: { userId } })).toBe(1);
  }, 60000);
});
