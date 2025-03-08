/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransationPaymentMethod } from '@prisma/client';
import { PrismaService } from 'src/prisma-services/prisma.service';
import { addMonths } from 'date-fns';

@Injectable()
export class TransationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.TransationCreateInput) {
    if (
      data.paymentMethod === TransationPaymentMethod.CREDIT_CARD &&
      (!data.installments || data.installments < 1)
    ) {
      throw new BadRequestException(
        'A quantidade de parcelas é obrigatória e deve ser maior que 0 para pagamentos com cartão de crédito.'
      );
    }

    const transactions = [];

    if (data.paymentMethod === TransationPaymentMethod.CREDIT_CARD && data.installments > 1) {
      const installmentValue = Number(data.amount) / data.installments;
      const startDate = new Date(data.Date);

      for (let i = 1; i <= data.installments; i++) {
        transactions.push(
          this.prisma.transation.create({
            data: {
              ...data,
              amount: installmentValue, 
              installmentInfo: `${i}/${data.installments}`,
              Date: addMonths(startDate, i - 1),
            },
          })
        );
      }

      return Promise.all(transactions);
    }

    return this.prisma.transation.create({ data });
  }

  async findAll() {
    return this.prisma.transation.findMany();
  }

  async getTotalExpensesAndInvestmentsForPreviousMonth(userId: string, date: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid date format. Expected format: YYYY-MM-DD');
    }

    const [year, month] = date.split('-');
    const targetMonth = parseInt(month, 10) - 1;

    const startDate = new Date(Number(year), targetMonth, 1);
    const endDate = new Date(startDate); 
    endDate.setMonth(endDate.getMonth() + 1);

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
      by: ['category', 'type'],
      _sum: { amount: true },
      _count: { id: true },
      where: { 
        userId, 
        Date: { gte: startDate, lt: endDate },
        type: 'EXPENSE',
      },
      orderBy: { _count: { id: 'desc' } },
      take: 4,
    });
    
    const topCategories = categoryAggregates
      .filter((category) => category.category !== 'SALARY')
      .map((category) => {
        const expensesValue = category._sum.amount ? category._sum.amount.toNumber() : 0;
    
        return {
          category: category.category,
          percent: calculatePercentage(category._count.id, totalTransactionsCount),
          value: expensesValue,
        };
      });
    

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

  async getTotalExpensesAndInvestmentsForYear(userId: string, year: string) {
    if (!year || !/^\d{4}$/.test(year)) {
      throw new Error('Invalid year format. Expected format: YYYY');
    }
  
    const startDate = new Date(Number(year), 0, 1);
    const endDate = new Date(Number(year) + 1, 0, 1);
  
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
  
    // Calculating the balance sheet for the previous year
    const [prevTotalExpenses, prevTotalInvestments, prevTotalDeposits] = await Promise.all([
      calculateSumByType('EXPENSE'),
      calculateSumByType('INVESTMENT'),
      calculateSumByType('DEPOSIT'),
    ]);

    const prevTotalTransactionsAmount = prevTotalDeposits + prevTotalInvestments + prevTotalExpenses;
    const prevBalance = prevTotalDeposits - (prevTotalExpenses + prevTotalInvestments);

    const prevExpensePercentage = calculatePercentage(prevTotalExpenses, prevTotalTransactionsAmount);
    const prevInvestmentPercentage = calculatePercentage(prevTotalInvestments, prevTotalTransactionsAmount);
    const prevDepositPercentage = calculatePercentage(prevTotalDeposits, prevTotalTransactionsAmount);

    const anualBalance = [
      {
        category: 'Balance',
        percent: null,
        value: prevBalance,
      },
      {
        category: 'DEPÓSITOS',
        percent: prevDepositPercentage,
        value: prevTotalDeposits,
      },
      {
        category: 'DESPESAS',
        percent: prevExpensePercentage,
        value: prevTotalExpenses,
      },
      {
        category: 'INVESTIMENTOS',
        percent: prevInvestmentPercentage,
        value: prevTotalInvestments,
      },
    ];
  
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
      anualBalance,
    };
  }  

  async findOne(id: string) {
    return this.prisma.transation.findUnique({ where: { id } });
  }

  async findByUserIdAndMonth(userId: string, date: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid date format. Expected format: YYYY-MM-DD');
    }

    const [year, month] = date.split('-');
    const targetMonth = parseInt(month, 10) - 1;

    const startDate = new Date(Number(year), targetMonth, 1);
    const endDate = new Date(startDate); 
    endDate.setMonth(endDate.getMonth() + 1);

    return this.prisma.transation.findMany({
      where: {
        userId,
        Date: {
          gte: startDate,
          lt: endDate,
        },
      },
    });
  }

  async update(id: string, data: Prisma.TransationUpdateInput) {
    return this.prisma.transation.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    const transaction = await this.prisma.transation.findUnique({ where: { id } });
    if (!transaction) {
      throw new NotFoundException('Transação não encontrada.');
    }
  
    if (transaction.paymentMethod === TransationPaymentMethod.CREDIT_CARD) {
      await this.prisma.transation.deleteMany({
        where: {
          createdAt: transaction.createdAt,
          name: transaction.name,
        },
      });
      return;
    }

    return this.prisma.transation.delete({ where: { id } });
  }
 
  async getTopCreditCardsByMonth(userId: string, date: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid date format. Expected format: YYYY-MM-DD');
    }
  
    const [year, month] = date.split('-');
    const targetMonth = parseInt(month, 10) - 1;
  
    const startDate = new Date(Number(year), targetMonth, 1);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
  
    // Agregar as transações por "nameCard" e somar os valores para o mês atual
    const creditCardAggregates = await this.prisma.transation.groupBy({
      by: ['nameCard'],
      _sum: { amount: true },
      where: {
        userId,
        type: 'EXPENSE',
        Date: { gte: startDate, lt: endDate },
        paymentMethod: 'CREDIT_CARD',
      },
      orderBy: { _sum: { amount: 'desc' } },
    });
  
    // Calcular o total das despesas para o mês atual
    const totalExpenses = await this.prisma.transation.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        type: 'EXPENSE',
        Date: { gte: startDate, lt: endDate },
      },
    });
  
    const totalAmount = Number(totalExpenses._sum.amount) || 0;
  
    const topCreditCards = await Promise.all(creditCardAggregates.map(async (aggregate) => {
      const totalValueMonth = aggregate._sum.amount ? aggregate._sum.amount.toNumber() : 0;
  
      // Somar o total de todas as transações feitas com o mesmo nameCard no mês atual
      const totalValueMonthParcelado = await this.prisma.transation.aggregate({
        _sum: { amount: true },
        where: {
          userId,
          type: 'EXPENSE',
          paymentMethod: 'CREDIT_CARD',
          nameCard: aggregate.nameCard,
          Date: { gte: startDate, lt: endDate },
          installments: { gt: 0 }, // Considerando as parcelas
        },
      });
  
      const totalParceladoMonth = Number(totalValueMonthParcelado._sum.amount) || 0;
  
      // Somar o total de todas as transações feitas com o mesmo nameCard a partir do mês atual
      const totalValueRemainingMonths = await this.prisma.transation.aggregate({
        _sum: { amount: true },
        where: {
          userId,
          type: 'EXPENSE',
          paymentMethod: 'CREDIT_CARD',
          nameCard: aggregate.nameCard,
          Date: {
            gte: new Date(), // A partir da data atual
          },
        },
      });
  
      const totalRemaining = Number(totalValueRemainingMonths._sum.amount) || 0;
  
      return {
        card: aggregate.nameCard,
        valorTotalMes: totalValueMonth, // Inclui apenas transações do mês atual
        valorTotalTodosMesesRestantes: totalRemaining + totalParceladoMonth, // Inclui as parcelas do mês atual
      };
    }));
  
    // Limitar o número de objetos no array para no máximo 5
    const limitedTopCreditCards = topCreditCards.slice(0, 5);
  
    return { topCredcards: limitedTopCreditCards };
  }  
}
