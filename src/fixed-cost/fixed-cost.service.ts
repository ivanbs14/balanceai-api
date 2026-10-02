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
} from "@prisma/client";
import { PrismaService } from "../prisma-services/prisma.service";
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
    throw error;
  }

  private normalizeDateInput(value: string | Date) {
    const parsedValue = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(parsedValue.getTime())) {
      throw new BadRequestException("Data inválida para custo fixo.");
    }

    return parsedValue;
  }

  private getMonthIndex(value: string | Date) {
    const parsedValue = this.normalizeDateInput(value);

    return parsedValue.getUTCFullYear() * 12 + parsedValue.getUTCMonth();
  }

  private validateCompetence(competence: string) {
    if (!competence || !/^\d{4}-\d{2}$/.test(competence)) {
      throw new BadRequestException(
        "Competence inválida. Use o formato YYYY-MM.",
      );
    }
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

          return shouldProjectRecurring || shouldKeepPaidHistory;
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
              status: monthly?.status ?? FixedCostMonthlyStatus.PENDING,
              amount: monthly?.amount ?? fixedCost.defaultAmount,
              paidAt: monthly?.paidAt ?? null,
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
    let updatedFixedCost;
    try {
      updatedFixedCost = await this.prisma.fixedCost.update({
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
    } catch (error) {
      this.rethrowMissing(error);
    }

    if (data.defaultAmount !== undefined) {
      await this.prisma.fixedCostMonthly.updateMany({
        where: {
          fixedCostId: id,
          fixedCost: { userId },
          status: FixedCostMonthlyStatus.PENDING,
        },
        data: {
          amount: data.defaultAmount,
        },
      });
    }

    return updatedFixedCost;
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

    const amount = data.amount ?? fixedCost.defaultAmount;
    const paidAt =
      data.status === FixedCostMonthlyStatus.PAID
        ? data.paidAt
          ? new Date(data.paidAt)
          : new Date()
        : null;

    const existingMonthly = await this.prisma.fixedCostMonthly.findUnique({
      where: {
        fixedCostId_competence: {
          fixedCostId: id,
          competence,
        },
      },
    });

    if (existingMonthly) {
      return this.prisma.fixedCostMonthly.update({
        where: { id: existingMonthly.id },
        data: {
          status: data.status,
          amount,
          paidAt,
        },
      });
    }

    return this.prisma.fixedCostMonthly.create({
      data: {
        fixedCostId: id,
        competence,
        status: data.status,
        amount,
        paidAt,
      },
    });
  }
}
