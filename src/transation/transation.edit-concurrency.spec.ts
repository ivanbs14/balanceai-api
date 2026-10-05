import {
  Prisma,
  PrismaClient,
  TransationPaymentMethod,
  TransationPaymentStatus,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { FixedCostService } from "../fixed-cost/fixed-cost.service";
import { PrismaService } from "../prisma-services/prisma.service";
import { TransationService } from "./transation.service";

const databaseUrl = process.env.TECH014_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("pending installment edit in isolated PostgreSQL", () => {
  let prisma: PrismaClient;
  const groupId = randomUUID();
  const userId = `tech014-user-${groupId}`;

  beforeAll(async () => {
    const host = new URL(databaseUrl!).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") {
      throw new Error(
        "TECH014_DATABASE_URL must point to an isolated localhost database.",
      );
    }
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.transation.deleteMany({
      where: { installmentGroupId: groupId },
    });
    await prisma.$disconnect();
  });

  it("rolls back earlier edits when another parcel is paid before its conditional update", async () => {
    const base = {
      userId,
      name: "Original",
      type: "EXPENSE" as const,
      amount: "20.00",
      category: "OTHER" as const,
      paymentMethod: TransationPaymentMethod.PIX,
      installments: 2,
      installmentGroupId: groupId,
      Date: new Date("2026-10-05T00:00:00.000Z"),
      withdrawal: "DEPOSIT" as const,
    };
    const first = await prisma.transation.create({
      data: { ...base, installmentInfo: "1/2" },
    });
    const second = await prisma.transation.create({
      data: {
        ...base,
        installmentInfo: "2/2",
        Date: new Date("2026-11-05T00:00:00.000Z"),
      },
    });
    let updates = 0;
    const servicePrisma = {
      transation: {
        findUnique: (args: Prisma.TransationFindUniqueArgs) =>
          prisma.transation.findUnique(args),
      },
      $transaction: (
        callback: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        prisma.$transaction(async (tx) =>
          callback({
            transation: {
              findMany: (args: Prisma.TransationFindManyArgs) =>
                tx.transation.findMany(args),
              updateMany: async (args: Prisma.TransationUpdateManyArgs) => {
                updates += 1;
                if (updates === 2) {
                  await prisma.transation.update({
                    where: { id: second.id },
                    data: { paymentStatus: TransationPaymentStatus.PAID },
                  });
                }
                return tx.transation.updateMany(args);
              },
              deleteMany: (args: Prisma.TransationDeleteManyArgs) =>
                tx.transation.deleteMany(args),
              create: (args: Prisma.TransationCreateArgs) =>
                tx.transation.create(args),
            },
          } as unknown as Prisma.TransactionClient),
        ),
    } as unknown as PrismaService;
    const service = new TransationService(
      servicePrisma,
      {} as FixedCostService,
    );

    await expect(
      service.updateInstallmentGroup(first.id, userId, {
        name: "Changed",
        amount: "50.00",
        Date: "2027-01-05",
        installments: 2,
        paymentMethod: TransationPaymentMethod.PIX,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const remaining = await prisma.transation.findMany({
      where: { installmentGroupId: groupId },
      orderBy: { installmentInfo: "asc" },
    });
    expect(remaining).toHaveLength(2);
    expect(remaining[0]).toMatchObject({
      id: first.id,
      name: "Original",
      paymentStatus: "PENDING",
    });
    expect(remaining[1]).toMatchObject({
      id: second.id,
      name: "Original",
      paymentStatus: "PAID",
    });
  });
});
