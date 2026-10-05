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

const databaseUrl = process.env.TECH011_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase(
  "pending installment deletion in isolated PostgreSQL",
  () => {
    let prisma: PrismaClient;
    const groupId = randomUUID();
    const userId = `tech011-user-${groupId}`;
    const otherUserId = `tech011-other-${groupId}`;

    beforeAll(async () => {
      const host = new URL(databaseUrl!).hostname;
      if (host !== "127.0.0.1" && host !== "localhost") {
        throw new Error(
          "TECH011_DATABASE_URL must point to an isolated localhost database.",
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

    it("preserves a parcel paid after the anchor read and ignores another owner", async () => {
      const base = {
        name: `TECH011_${groupId}`,
        type: "EXPENSE" as const,
        amount: "10.00",
        category: "OTHER" as const,
        paymentMethod: TransationPaymentMethod.PIX,
        installments: 3,
        installmentGroupId: groupId,
        Date: new Date("2026-10-05T12:00:00.000Z"),
        withdrawal: "DEPOSIT" as const,
      };
      const anchor = await prisma.transation.create({
        data: { ...base, userId, installmentInfo: "1/3" },
      });
      const newlyPaid = await prisma.transation.create({
        data: { ...base, userId, installmentInfo: "2/3" },
      });
      const alreadyPaid = await prisma.transation.create({
        data: {
          ...base,
          userId,
          installmentInfo: "3/3",
          paymentStatus: TransationPaymentStatus.PAID,
        },
      });
      const otherOwner = await prisma.transation.create({
        data: { ...base, userId: otherUserId, installmentInfo: "1/3" },
      });

      const servicePrisma = {
        transation: {
          findUnique: (args: Prisma.TransationFindUniqueArgs) =>
            prisma.transation.findUnique(args),
          deleteMany: async (args: Prisma.TransationDeleteManyArgs) => {
            await prisma.transation.update({
              where: { id: newlyPaid.id },
              data: { paymentStatus: TransationPaymentStatus.PAID },
            });
            return prisma.transation.deleteMany(args);
          },
        },
      } as unknown as PrismaService;
      const service = new TransationService(
        servicePrisma,
        {} as FixedCostService,
      );

      await expect(service.delete(anchor.id, userId)).resolves.toEqual({
        deletedCount: 1,
        preservedPaidCount: 2,
      });

      const remaining = await prisma.transation.findMany({
        where: { installmentGroupId: groupId },
        orderBy: { id: "asc" },
      });
      expect(remaining.map((row) => row.id).sort()).toEqual(
        [newlyPaid.id, alreadyPaid.id, otherOwner.id].sort(),
      );
      expect(
        remaining.find((row) => row.id === newlyPaid.id)?.paymentStatus,
      ).toBe(TransationPaymentStatus.PAID);
    });
  },
);
