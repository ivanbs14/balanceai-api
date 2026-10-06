import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FixedCostMonthlyStatus,
  FixedCostRecurrence,
  Prisma,
  TransationPaymentStatus,
  TransationType,
} from "@prisma/client";
import { PrismaService } from "../prisma-services/prisma.service";
import { civilUtc, parseCivilDate, parseCompetence } from "../common/civil-date";
import { CreateFixedCostDto } from "./dto/create-fixed-cost.dto";
import { UpdateFixedCostDto } from "./dto/update-fixed-cost.dto";
import { UpdateFixedCostMonthlyDto } from "./dto/update-fixed-cost-monthly.dto";

@Injectable()
export class FixedCostService {
  constructor(private readonly prisma: PrismaService) {}

  private validateId(id: string) {
    if (!id?.trim())
      throw new BadRequestException("ID do custo fixo inválido.");
  }

  private async requireOwned(id: string, userId: string) {
    this.validateId(id);
    const fixedCost = await this.prisma.fixedCost.findFirst({
      where: { id, userId },
    });
    if (!fixedCost) throw new NotFoundException("Custo fixo não encontrado.");
    return fixedCost;
  }

  private rethrowMissing(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new NotFoundException("Custo fixo não encontrado.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code)) {
      throw new ConflictException("Operação concorrente ou recurso com dependências. Recarregue e tente novamente.");
    }
    throw error;
  }

  private normalizeDateInput(value: string | Date) {
    return value instanceof Date ? value : parseCivilDate(value);
  }

  private getMonthIndex(value: string | Date) {
    const parsedValue = this.normalizeDateInput(value);

    return parsedValue.getUTCFullYear() * 12 + parsedValue.getUTCMonth();
  }

  private validateCompetence(competence: string) {
    parseCompetence(competence);
  }

  private isRecurrenceDueForMonth(params: {
    recurrence: FixedCostRecurrence;
    startDate: Date;
    competence: string;
  }) {
    const startMonthIndex = this.getMonthIndex(params.startDate);
    const competenceMonthIndex = this.getMonthIndex(`${params.competence}-01`);
    const monthDelta = competenceMonthIndex - startMonthIndex;

    if (monthDelta < 0) {
      return false;
    }

    const intervalByRecurrence: Record<FixedCostRecurrence, number> = {
      MONTHLY: 1,
      BIMONTHLY: 2,
      QUARTERLY: 3,
      YEARLY: 12,
    };

    return monthDelta % intervalByRecurrence[params.recurrence] === 0;
  }

  async create(data: CreateFixedCostDto, userId: string) {
    return this.prisma.fixedCost.create({
      data: {
        name: data.name,
        userId,
        defaultAmount: data.defaultAmount,
        category: data.category,
        paymentMethod: data.paymentMethod,
        recurrence: data.recurrence,
        startDate: this.normalizeDateInput(data.startDate),
        dueDay: data.dueDay,
        isActive: data.isActive ?? true,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.fixedCost.findMany({
      where: { userId },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async findByUserId(userId: string) {
    return this.prisma.fixedCost.findMany({
      where: { userId },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  async findByUserIdAndMonth(userId: string, competence: string) {
    this.validateCompetence(competence);

    const fixedCosts = await this.prisma.fixedCost.findMany({
      where: { userId },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        monthlys: {
          where: {
            competence,
          },
          take: 1,
        },
      },
    });
    const { year, month } = parseCompetence(competence);
    const lastDay = civilUtc(year, month, 0).getUTCDate();

    return {
      data: fixedCosts
        .filter((fixedCost) => {
          const monthly = fixedCost.monthlys[0];
          const shouldProjectRecurring =
            fixedCost.isActive &&
            this.isRecurrenceDueForMonth({
              recurrence: fixedCost.recurrence,
              startDate: fixedCost.startDate,
              competence,
            });
          const shouldKeepPaidHistory =
            monthly?.status === FixedCostMonthlyStatus.PAID;

          return shouldProjectRecurring || shouldKeepPaidHistory || Boolean(monthly?.transactionId);
        })
        .map((fixedCost) => {
          const { monthlys, ...rest } = fixedCost;
          const monthly = monthlys[0];

          return {
            ...rest,
            paymentType: fixedCost.paymentMethod,
            paymentMethod: fixedCost.paymentMethod,
            category: fixedCost.category,
            monthly: {
              id: monthly?.id ?? null,
              competence,
              dueDate: civilUtc(year, month - 1, Math.min(fixedCost.dueDay, lastDay)).toISOString().slice(0, 10),
              status: monthly?.status ?? FixedCostMonthlyStatus.PENDING,
              amount: monthly?.amount ?? fixedCost.defaultAmount,
              paidAt: monthly?.paidAt ?? null,
              transactionId: monthly?.transactionId ?? null,
            },
          };
        }),
    };
  }

  async findOne(id: string, userId: string) {
    return this.requireOwned(id, userId);
  }

  async update(id: string, userId: string, data: UpdateFixedCostDto) {
    await this.requireOwned(id, userId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updatedFixedCost = await tx.fixedCost.update({
          where: { id, userId },
          data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.defaultAmount !== undefined
            ? { defaultAmount: data.defaultAmount }
            : {}),
          ...(data.category !== undefined ? { category: data.category } : {}),
          ...(data.paymentMethod !== undefined
            ? { paymentMethod: data.paymentMethod }
            : {}),
          ...(data.recurrence !== undefined
            ? { recurrence: data.recurrence }
            : {}),
          ...(data.startDate !== undefined
            ? { startDate: this.normalizeDateInput(data.startDate) }
            : {}),
          ...(data.dueDay !== undefined ? { dueDay: data.dueDay } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          },
        });
        if (data.defaultAmount !== undefined) {
          await tx.fixedCostMonthly.updateMany({
            where: {
              fixedCostId: id,
              fixedCost: { userId },
              status: FixedCostMonthlyStatus.PENDING,
              transactionId: null,
            },
            data: { amount: data.defaultAmount },
          });
        }
        return updatedFixedCost;
      });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }

  async remove(id: string, userId: string) {
    await this.requireOwned(id, userId);
    if (
      await this.prisma.fixedCostMonthly.count({ where: { fixedCostId: id } })
    ) {
      throw new ConflictException("Custo fixo possui mensalidades associadas.");
    }
    try {
      return await this.prisma.fixedCost.delete({ where: { id, userId } });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }

  async updateMonthly(
    id: string,
    userId: string,
    competence: string,
    data: UpdateFixedCostMonthlyDto,
  ) {
    this.validateCompetence(competence);
    const fixedCost = await this.requireOwned(id, userId);
    if (!this.isRecurrenceDueForMonth({ recurrence: fixedCost.recurrence, startDate: fixedCost.startDate, competence })) {
      throw new BadRequestException("Competência fora da recorrência do custo fixo.");
    }

    const paidAt =
      data.status === FixedCostMonthlyStatus.PAID
        ? data.paidAt
          ? new Date(data.paidAt)
          : new Date()
        : null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const where = { fixedCostId_competence: { fixedCostId: id, competence } };
        const existing = await tx.fixedCostMonthly.findUnique({ where });
        const amount = data.amount ?? existing?.amount ?? fixedCost.defaultAmount;
        if (existing?.transactionId) {
          const updated = await tx.transation.updateMany({
            where: { id: existing.transactionId, userId, type: TransationType.EXPENSE },
            data: {
              paymentStatus: data.status === FixedCostMonthlyStatus.PAID ? TransationPaymentStatus.PAID : TransationPaymentStatus.PENDING,
              paidAt,
              ...(data.amount !== undefined ? { amount: data.amount } : {}),
            },
          });
          if (updated.count !== 1) throw new ConflictException("Transação vinculada indisponível.");
        }
        return tx.fixedCostMonthly.upsert({
          where,
          create: { fixedCostId: id, competence, status: data.status, amount, paidAt },
          update: { status: data.status, amount, paidAt },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }

  async linkMonthly(id: string, userId: string, competence: string, transactionId: string) {
    this.validateCompetence(competence);
    const fixedCost = await this.requireOwned(id, userId);
    if (!this.isRecurrenceDueForMonth({ recurrence: fixedCost.recurrence, startDate: fixedCost.startDate, competence })) {
      throw new BadRequestException("Competência fora da recorrência do custo fixo.");
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const transaction = await tx.transation.findFirst({ where: { id: transactionId, userId, type: TransationType.EXPENSE } });
        if (!transaction || transaction.Date.toISOString().slice(0, 7) !== competence) {
          throw new BadRequestException("Transação de despesa e competência do mesmo titular são obrigatórias.");
        }
        const other = await tx.fixedCostMonthly.findFirst({ where: { transactionId } });
        if (other) throw new ConflictException("Transação já vinculada a uma mensalidade.");
        const where = { fixedCostId_competence: { fixedCostId: id, competence } };
        const existing = await tx.fixedCostMonthly.findUnique({ where });
        if (existing?.transactionId) throw new ConflictException("Mensalidade já vinculada.");
        if (existing?.status === FixedCostMonthlyStatus.PAID && transaction.paymentStatus !== TransationPaymentStatus.PAID) {
          throw new ConflictException("Reconcile o pagamento por ID antes do vínculo.");
        }
        return tx.fixedCostMonthly.upsert({
          where,
          create: {
            fixedCostId: id, competence, transactionId,
            status: transaction.paymentStatus === TransationPaymentStatus.PAID ? FixedCostMonthlyStatus.PAID : FixedCostMonthlyStatus.PENDING,
            amount: transaction.amount, paidAt: transaction.paidAt,
          },
          update: {
            transactionId,
            status: transaction.paymentStatus === TransationPaymentStatus.PAID ? FixedCostMonthlyStatus.PAID : FixedCostMonthlyStatus.PENDING,
            amount: transaction.amount, paidAt: transaction.paidAt,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }

  async unlinkMonthly(id: string, userId: string, competence: string) {
    this.validateCompetence(competence);
    await this.requireOwned(id, userId);
    const monthly = await this.prisma.fixedCostMonthly.findUnique({ where: { fixedCostId_competence: { fixedCostId: id, competence } } });
    if (!monthly?.transactionId) throw new NotFoundException("Vínculo não encontrado.");
    try {
      return await this.prisma.fixedCostMonthly.update({
        where: { id: monthly.id, transactionId: monthly.transactionId },
        data: { transactionId: null },
      });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }
}
