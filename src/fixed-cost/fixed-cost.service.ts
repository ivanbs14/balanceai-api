/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FixedCostMonthlyStatus, FixedCostRecurrence, Prisma } from '@prisma/client';
import { addMonths } from 'date-fns';
import { PrismaService } from '../prisma-services/prisma.service';
import { CreateFixedCostDto } from './dto/create-fixed-cost.dto';
import { UpdateFixedCostDto } from './dto/update-fixed-cost.dto';
import { UpdateFixedCostMonthlyDto } from './dto/update-fixed-cost-monthly.dto';

@Injectable()
export class FixedCostService {
  constructor(private readonly prisma: PrismaService) {}

  private mapFixedCostPaymentType(recurrence: FixedCostRecurrence) {
    return recurrence;
  }

  private validateCompetence(competence: string) {
    if (!competence || !/^\d{4}-\d{2}$/.test(competence)) {
      throw new BadRequestException('Competence inválida. Use o formato YYYY-MM.');
    }
  }

  async create(data: CreateFixedCostDto) {
    return this.prisma.fixedCost.create({
      data: {
        name: data.name,
        userId: data.userId,
        defaultAmount: data.defaultAmount,
        recurrence: data.recurrence,
        dueDay: data.dueDay,
        isActive: data.isActive ?? true,
      },
    });
  }

  async findAll() {
    return this.prisma.fixedCost.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByUserId(userId: string) {
    return this.prisma.fixedCost.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findByUserIdAndMonth(userId: string, competence: string) {
    this.validateCompetence(competence);

    const fixedCosts = await this.prisma.fixedCost.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'asc',
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
      data: fixedCosts.map((fixedCost) => {
        const { monthlys, ...rest } = fixedCost;
        const monthly = monthlys[0];

        return {
          ...rest,
          paymentType: this.mapFixedCostPaymentType(fixedCost.recurrence),
          category: 'FIXED_COST',
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

  async findOne(id: string) {
    return this.prisma.fixedCost.findUnique({
      where: { id },
    });
  }

  async update(id: string, data: UpdateFixedCostDto) {
    return this.prisma.fixedCost.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.prisma.fixedCost.delete({
      where: { id },
    });
  }

  async updateMonthly(id: string, competence: string, data: UpdateFixedCostMonthlyDto) {
    this.validateCompetence(competence);

    const fixedCost = await this.prisma.fixedCost.findUnique({
      where: { id },
    });

    if (!fixedCost) {
      throw new NotFoundException('Custo fixo não encontrado.');
    }

    const amount = data.amount ?? fixedCost.defaultAmount;
    const paidAt = data.status === FixedCostMonthlyStatus.PAID
      ? (data.paidAt ? new Date(data.paidAt) : new Date())
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
