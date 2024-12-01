/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma-services/prisma.service';

@Injectable()
export class TransationService {
  constructor(private readonly prisma: PrismaService) {}

  // Create
  async create(data: Prisma.TransationCreateInput) {
    return this.prisma.transation.create({ data });
  }

  // Get All
  async findAll() {
    return this.prisma.transation.findMany();
  }

  // Get Total Expenses for Previous Month
  async getTotalExpensesAndInvestmentsForPreviousMonth(userId: string, month: string) {
    const year = new Date().getFullYear();
    const startDate = new Date(`${year}-${month}-01T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const expenses = await this.prisma.transation.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        userId,
        type: 'EXPENSE',
        Date: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    const investments = await this.prisma.transation.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        userId,
        type: 'INVESTMENT',
        Date: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    const deposits = await this.prisma.transation.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        userId,
        type: 'DEPOSIT',
        Date: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    const totalTransactions = await this.prisma.transation.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        userId,
        Date: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    const totalExpenses = Number(expenses._sum.amount) || 0;
    const totalInvestments = Number(investments._sum.amount) || 0;
    const totalDeposits = Number(deposits._sum.amount) || 0;
    const totalAmount = Number(totalTransactions._sum.amount) || 0;

    const balance = totalDeposits - (totalExpenses + totalInvestments);

    const expensePercentage = totalAmount ? Math.round((totalExpenses / totalAmount) * 1000) / 10 : 0;
    const investmentPercentage = totalAmount ? Math.round((totalInvestments / totalAmount) * 1000) / 10 : 0;
    const depositPercentage = totalAmount ? Math.round((totalDeposits / totalAmount) * 1000) / 10 : 0;

    return {
      totalExpenses,
      totalInvestments,
      totalDeposits,
      balance,
      expensePercentage,
      investmentPercentage,
      depositPercentage,
    };
  }

  // Get by ID
  async findOne(id: string) {
    return this.prisma.transation.findUnique({ where: { id } });
  }

  // Get by User ID
  async findByUserId(userId: string) {
    return this.prisma.transation.findMany({ where: { userId } });
  }

  // Update
  async update(id: string, data: Prisma.TransationUpdateInput) {
    return this.prisma.transation.update({
      where: { id },
      data,
    });
  }

  // Delete
  async delete(id: string) {
    return this.prisma.transation.delete({ where: { id } });
  }
}
