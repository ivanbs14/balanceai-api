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

  private async lockOwned(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
  ) {
    this.validateId(id);
    await tx.$executeRaw`
      SELECT 1 FROM "FixedCost"
      WHERE "id" = ${id} AND "userId" = ${userId}
      FOR UPDATE
    `;
    const fixedCost = await tx.fixedCost.findFirst({ where: { id, userId } });
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

  private validateSchedule(params: {
    recurrence: FixedCostRecurrence;
    startDate: Date;
    endDate: Date | null;
  }) {
    if (!params.endDate) return;
    if (params.recurrence !== FixedCostRecurrence.MONTHLY) {
      throw new BadRequestException("A data final só pode ser usada em recorrências mensais.");
    }
    if (params.endDate.getTime() < params.startDate.getTime()) {
      throw new BadRequestException("A data final deve ser igual ou posterior à data inicial.");
    }
    if (params.endDate.getUTCDate() !== params.startDate.getUTCDate()) {
      throw new BadRequestException("A data final deve manter o mesmo dia da data inicial.");
    }
  }

  private isRecurrenceDueForMonth(params: {
    recurrence: FixedCostRecurrence;
    startDate: Date;
    endDate?: Date | null;
    competence: string;
  }) {
    const startMonthIndex = this.getMonthIndex(params.startDate);
    const competenceMonthIndex = this.getMonthIndex(`${params.competence}-01`);
    const monthDelta = competenceMonthIndex - startMonthIndex;

    if (monthDelta < 0) {
      return false;
    }

    if (
      params.endDate &&
      competenceMonthIndex > this.getMonthIndex(params.endDate)
    ) {
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
    const startDate = this.normalizeDateInput(data.startDate);
    const endDate = data.endDate ? this.normalizeDateInput(data.endDate) : null;
    this.validateSchedule({ recurrence: data.recurrence, startDate, endDate });
    return this.prisma.fixedCost.create({
      data: {
        name: data.name,
        userId,
        defaultAmount: data.defaultAmount,
        category: data.category,
        paymentMethod: data.paymentMethod,
        recurrence: data.recurrence,
        startDate,
        endDate,
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
              endDate: fixedCost.endDate,
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await this.lockOwned(tx, id, userId);

        const recurrence = data.recurrence ?? current.recurrence;
        const startDate = data.startDate !== undefined
          ? this.normalizeDateInput(data.startDate)
          : current.startDate;
        const endDate = data.endDate !== undefined
          ? data.endDate === null
            ? null
            : this.normalizeDateInput(data.endDate)
          : current.endDate;
        this.validateSchedule({ recurrence, startDate, endDate });

        const currentEndMonth = current.endDate
          ? this.getMonthIndex(current.endDate)
          : null;
        const nextEndMonth = endDate ? this.getMonthIndex(endDate) : null;
        const shortensRecurrence = nextEndMonth !== null &&
          (currentEndMonth === null || nextEndMonth < currentEndMonth);

        if (shortensRecurrence && endDate) {
          const endCompetence = endDate.toISOString().slice(0, 7);
          const protectedMonthlyCount = await tx.fixedCostMonthly.count({
            where: {
              fixedCostId: id,
              competence: { gt: endCompetence },
              OR: [
                { status: FixedCostMonthlyStatus.PAID },
                { transactionId: { not: null } },
              ],
            },
          });
          if (protectedMonthlyCount > 0) {
            throw new ConflictException({
              code: "FIXED_COST_END_DATE_PROTECTED_HISTORY",
              protectedMonthlyCount,
              message: "Existem mensalidades posteriores pagas ou vinculadas.",
            });
          }

          const pendingMonthlyCount = await tx.fixedCostMonthly.count({
            where: {
              fixedCostId: id,
              competence: { gt: endCompetence },
              status: FixedCostMonthlyStatus.PENDING,
              transactionId: null,
            },
          });
          if (!data.confirmEndDateChange) {
            throw new ConflictException({
              code: "FIXED_COST_END_DATE_CONFIRMATION_REQUIRED",
              pendingMonthlyCount,
              message: "Confirme o encerramento da recorrência.",
            });
          }
          await tx.fixedCostMonthly.deleteMany({
            where: {
              fixedCostId: id,
              competence: { gt: endCompetence },
              status: FixedCostMonthlyStatus.PENDING,
              transactionId: null,
            },
          });
        }

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
            ? { startDate }
            : {}),
          ...(data.endDate !== undefined ? { endDate } : {}),
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
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
    const paidAt =
      data.status === FixedCostMonthlyStatus.PAID
        ? data.paidAt
          ? new Date(data.paidAt)
          : new Date()
        : null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const fixedCost = await this.lockOwned(tx, id, userId);
        if (!this.isRecurrenceDueForMonth({ recurrence: fixedCost.recurrence, startDate: fixedCost.startDate, endDate: fixedCost.endDate, competence })) {
          throw new BadRequestException("Competência fora da recorrência do custo fixo.");
        }
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const fixedCost = await this.lockOwned(tx, id, userId);
        if (!this.isRecurrenceDueForMonth({ recurrence: fixedCost.recurrence, startDate: fixedCost.startDate, endDate: fixedCost.endDate, competence })) {
          throw new BadRequestException("Competência fora da recorrência do custo fixo.");
        }
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const fixedCost = await this.lockOwned(tx, id, userId);
        if (!this.isRecurrenceDueForMonth({ recurrence: fixedCost.recurrence, startDate: fixedCost.startDate, endDate: fixedCost.endDate, competence })) {
          throw new BadRequestException("Competência fora da recorrência do custo fixo.");
        }
        const monthly = await tx.fixedCostMonthly.findUnique({ where: { fixedCostId_competence: { fixedCostId: id, competence } } });
        if (!monthly?.transactionId) throw new NotFoundException("Vínculo não encontrado.");
        return tx.fixedCostMonthly.update({
          where: { id: monthly.id, transactionId: monthly.transactionId },
          data: { transactionId: null },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }
}
