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
    // Ajustar o mês e ano para o cálculo correto
    const year = new Date().getFullYear();
    const targetMonth = parseInt(month, 10) - 1; // Índice do mês (0 para janeiro, 11 para dezembro)
    const adjustedYear = targetMonth < 0 ? year - 1 : year; // Ajustar o ano se o mês for janeiro
  
    const startDate = new Date(adjustedYear, targetMonth, 1); // Primeiro dia do mês anterior
    const endDate = new Date(startDate); 
    endDate.setMonth(endDate.getMonth() + 1); // Primeiro dia do próximo mês
  
    const calculateSumByType = async (type: 'EXPENSE' | 'INVESTMENT' | 'DEPOSIT') => {
      const result = await this.prisma.transation.aggregate({
        _sum: { amount: true },
        where: {
          userId,
          type,
          Date: { gte: startDate, lt: endDate },
        },
      });
      return Number(result._sum.amount) || 0;
    };
  
    const [totalExpenses, totalInvestments, totalDeposits] = await Promise.all([
      calculateSumByType('EXPENSE'),
      calculateSumByType('INVESTMENT'),
      calculateSumByType('DEPOSIT'),
    ]);
  
    const totalTransactionsAmount = totalDeposits + totalInvestments + totalExpenses;
    const balance = totalDeposits - (totalExpenses + totalInvestments);
  
    const calculatePercentage = (value: number, total: number) =>
      total ? Math.round((value / total) * 1000) / 10 : 0;
  
    const expensePercentage = calculatePercentage(totalExpenses, totalTransactionsAmount);
    const investmentPercentage = calculatePercentage(totalInvestments, totalTransactionsAmount);
    const depositPercentage = calculatePercentage(totalDeposits, totalTransactionsAmount);
  
    const totalTransactionsCount = await this.prisma.transation.count({
      where: { userId, Date: { gte: startDate, lt: endDate } },
    });
  
    const categoryAggregates = await this.prisma.transation.groupBy({
      by: ['category'],
      _sum: { amount: true },
      _count: { id: true },
      where: { userId, Date: { gte: startDate, lt: endDate } },
      orderBy: { _count: { id: 'desc' } },
      take: 4,
    });
  
    const topCategories = categoryAggregates
      .filter((category) => category.category !== 'SALARY')
      .map((category) => ({
        category: category.category,
        percent: calculatePercentage(category._count.id, totalTransactionsCount),
        value: Number(category._sum.amount) || 0,
      }));
  
    // Obter as 10 últimas transações do mês anterior
    const lastTransactions = await this.prisma.transation.findMany({
      where: {
        userId,
        Date: { gte: startDate, lt: endDate },
      },
      orderBy: { Date: 'desc' },
      take: 10,
      select: {
        id: true,
        category: true,
        amount: true,
        type: true,
        Date: true,
      },
    });
  
    return {
      totalValues: {
        totalExpenses,
        totalInvestments,
        totalDeposits,
        balance,
      },
      percentsValues: {
        expensePercentage,
        investmentPercentage,
        depositPercentage,
      },
      topCategories,
      lastTransactions,
    };
  };

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
