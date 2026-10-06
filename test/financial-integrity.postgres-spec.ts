import { ConflictException } from "@nestjs/common";
import {
  FixedCostMonthlyStatus,
  FixedCostRecurrence,
  TransationCategory,
  TransationPaymentMethod,
  TransationPaymentStatus,
  TransationType,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { FixedCostService } from "../src/fixed-cost/fixed-cost.service";
import { PrismaService } from "../src/prisma-services/prisma.service";
import { TransationService } from "../src/transation/transation.service";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl)
  throw new Error("TEST_DATABASE_URL é obrigatória para testes PostgreSQL.");
const parsed = new URL(testUrl);
if (
  !parsed.pathname.endsWith("_test") ||
  !["127.0.0.1", "localhost", "postgres"].includes(parsed.hostname)
) {
  throw new Error(
    "TEST_DATABASE_URL deve apontar para banco *_test em host local ou serviço postgres do CI.",
  );
}
if (process.env.DATABASE_URL !== testUrl)
  throw new Error(
    "DATABASE_URL deve ser igual a TEST_DATABASE_URL nesta suíte.",
  );

describe("integridade financeira em PostgreSQL isolado", () => {
  const prisma = new PrismaService();
  const fixed = new FixedCostService(prisma);
  const transation = new TransationService(prisma, fixed);
  const ownerId = randomUUID();
  const otherId = randomUUID();
  const fixedId = randomUUID();
  const transactionId = randomUUID();
  const secondId = randomUUID();
  const cardId = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          name: "Teste A",
          email: `${ownerId}@example.test`,
          role: "user",
        },
        {
          id: otherId,
          name: "Teste B",
          email: `${otherId}@example.test`,
          role: "user",
        },
      ],
    });
    await prisma.card.create({
      data: {
        id: cardId,
        userId: otherId,
        name: "Outro",
        invoiceDate: new Date("2026-10-01"),
        invoicePayment: new Date("2026-10-10"),
        limitBalance: "1000.00",
      },
    });
    await prisma.fixedCost.create({
      data: {
        id: fixedId,
        userId: ownerId,
        name: "Conta",
        defaultAmount: "100.00",
        category: TransationCategory.UTILITY,
        paymentMethod: TransationPaymentMethod.PIX,
        recurrence: FixedCostRecurrence.MONTHLY,
        startDate: new Date("2026-10-01"),
        dueDay: 31,
      },
    });
    for (const id of [transactionId, secondId]) {
      await prisma.transation.create({
        data: {
          id,
          userId: ownerId,
          name: "Conta",
          type: TransationType.EXPENSE,
          amount: "100.00",
          category: TransationCategory.UTILITY,
          paymentMethod: TransationPaymentMethod.PIX,
          paymentStatus: TransationPaymentStatus.PAID,
          Date: new Date("2026-10-31"),
          withdrawal: TransationType.DEPOSIT,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.fixedCostMonthly.deleteMany({
      where: { fixedCostId: fixedId },
    });
    await prisma.transation.deleteMany({ where: { userId: ownerId } });
    await prisma.fixedCost.deleteMany({ where: { id: fixedId } });
    await prisma.card.deleteMany({ where: { id: cardId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await prisma.$disconnect();
  });

  it("liga uma obrigação projetada uma só vez e mantém pagamentos distintos", async () => {
    const linked = await fixed.linkMonthly(
      fixedId,
      ownerId,
      "2026-10",
      transactionId,
    );
    expect(linked.transactionId).toBe(transactionId);
    const summary = await transation.getAllBalance(ownerId, "2026-10");
    expect(summary.totalValues.realizedExpenses).toBe(200);
    expect(summary.totalValues.paidFixedCosts).toBe(0);
    await expect(
      fixed.linkMonthly(fixedId, ownerId, "2026-10", secondId),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      transation.delete(transactionId, ownerId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("sincroniza quitação e rejeita cartão de outro titular na constraint composta", async () => {
    await transation.updatePaymentStatus(transactionId, ownerId, {
      paymentStatus: TransationPaymentStatus.PENDING,
    });
    const monthly = await prisma.fixedCostMonthly.findUniqueOrThrow({
      where: {
        fixedCostId_competence: { fixedCostId: fixedId, competence: "2026-10" },
      },
    });
    expect(monthly.status).toBe(FixedCostMonthlyStatus.PENDING);
    await expect(
      prisma.transation.create({
        data: {
          userId: ownerId,
          name: "Inválida",
          type: TransationType.EXPENSE,
          amount: "1.00",
          category: TransationCategory.OTHER,
          paymentMethod: TransationPaymentMethod.CREDIT_CARD,
          cardId,
          Date: new Date("2026-10-01"),
          withdrawal: TransationType.DEPOSIT,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("mantém uma mensalidade sob duas gravações concorrentes", async () => {
    const writes = await Promise.allSettled([
      fixed.updateMonthly(fixedId, ownerId, "2026-11", {
        status: FixedCostMonthlyStatus.PAID,
      }),
      fixed.updateMonthly(fixedId, ownerId, "2026-11", {
        status: FixedCostMonthlyStatus.PAID,
      }),
    ]);
    expect(writes.some((write) => write.status === "fulfilled")).toBe(true);
    expect(
      await prisma.fixedCostMonthly.count({
        where: { fixedCostId: fixedId, competence: "2026-11" },
      }),
    ).toBe(1);
  });

  it("reverte o valor padrão se a atualização das mensalidades falhar", async () => {
    await fixed.updateMonthly(fixedId, ownerId, "2026-12", {
      status: FixedCostMonthlyStatus.PENDING,
    });
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION balance_test_reject_monthly() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.amount = 999.00 THEN RAISE EXCEPTION 'injected monthly failure'; END IF; RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER balance_test_reject_monthly_trigger BEFORE UPDATE ON "FixedCostMonthly" FOR EACH ROW EXECUTE FUNCTION balance_test_reject_monthly()`,
    );
    try {
      await expect(
        fixed.update(fixedId, ownerId, { defaultAmount: "999.00" }),
      ).rejects.toThrow();
      const stored = await prisma.fixedCost.findUniqueOrThrow({
        where: { id: fixedId },
      });
      expect(stored.defaultAmount.toFixed(2)).toBe("100.00");
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER balance_test_reject_monthly_trigger ON "FixedCostMonthly"`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION balance_test_reject_monthly()`,
      );
    }
  });

  it("desfaz vínculo sem apagar o pagamento ou a mensalidade", async () => {
    await fixed.unlinkMonthly(fixedId, ownerId, "2026-10");
    const monthly = await prisma.fixedCostMonthly.findUniqueOrThrow({
      where: {
        fixedCostId_competence: { fixedCostId: fixedId, competence: "2026-10" },
      },
    });
    expect(monthly.transactionId).toBeNull();
    expect(
      await prisma.transation.count({ where: { id: transactionId } }),
    ).toBe(1);
  });

  it("preserva todas as parcelas se uma parcela não âncora estiver vinculada", async () => {
    const groupId = randomUUID();
    const first = await prisma.transation.create({
      data: {
        userId: ownerId,
        name: "Grupo",
        type: TransationType.EXPENSE,
        amount: "20.00",
        category: TransationCategory.UTILITY,
        paymentMethod: TransationPaymentMethod.PIX,
        paymentStatus: TransationPaymentStatus.PENDING,
        installments: 2,
        installmentInfo: "1/2",
        installmentGroupId: groupId,
        Date: new Date("2027-02-15T00:00:00.000Z"),
        withdrawal: TransationType.DEPOSIT,
      },
    });
    const second = await prisma.transation.create({
      data: {
        userId: ownerId,
        name: "Grupo",
        type: TransationType.EXPENSE,
        amount: "20.00",
        category: TransationCategory.UTILITY,
        paymentMethod: TransationPaymentMethod.PIX,
        paymentStatus: TransationPaymentStatus.PENDING,
        installments: 2,
        installmentInfo: "2/2",
        installmentGroupId: groupId,
        Date: new Date("2027-03-15T00:00:00.000Z"),
        withdrawal: TransationType.DEPOSIT,
      },
    });
    await fixed.linkMonthly(fixedId, ownerId, "2027-03", second.id);

    await expect(
      transation.updateInstallmentGroup(first.id, ownerId, {
        name: "Grupo alterado",
        amount: "50.00",
        Date: "2027-02-15",
        installments: 2,
        paymentMethod: TransationPaymentMethod.PIX,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      (
        await prisma.transation.findUniqueOrThrow({ where: { id: second.id } })
      ).amount.toFixed(2),
    ).toBe("20.00");
    expect(
      (
        await prisma.fixedCostMonthly.findUniqueOrThrow({
          where: { transactionId: second.id },
        })
      ).amount.toFixed(2),
    ).toBe("20.00");
  });
});
