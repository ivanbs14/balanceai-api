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
 
  async findByNameCard(nameCard: string) {
    const card = await this.prisma.transation.findFirst({
      where: {
        paymentMethod: 'CREDIT_CARD',
        nameCard: {
          contains: nameCard.trim(),
          mode: 'insensitive',
        },
      },
      orderBy: {
        nameCard: 'asc',
      },
    });
  
    return card ? card.nameCard : null;
  };

  async getUniqueCreditCardNames(userId: string): Promise<string[]> {
    const transactions = await this.prisma.transation.findMany({
      where: {
        userId: userId,
        paymentMethod: 'CREDIT_CARD',
        nameCard: {
          not: null,
        },
      },
      select: {
        nameCard: true,
      },
    });

    const uniqueNames = Array.from(new Set(transactions.map(t => t.nameCard)));
    return uniqueNames;
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
  
    // Agrupar transações por "nameCard" e somar os valores
    const creditCardAggregates = await this.prisma.transation.groupBy({
      by: ['nameCard'],
      _sum: { amount: true },
      where: {
        userId,
        type: 'EXPENSE',
        Date: { gte: startDate, lt: endDate },
        paymentMethod: 'CREDIT_CARD',
      },
    });
  
    // Criar um mapa para armazenar os valores somados por "nameCard"
    const cardTotals = new Map<string, number>();
  
    for (const aggregate of creditCardAggregates) {
      const totalValueMonth = aggregate._sum.amount ? Number(aggregate._sum.amount) : 0;
      cardTotals.set(
        aggregate.nameCard,
        (cardTotals.get(aggregate.nameCard) || 0) + totalValueMonth
      );
    }
  
    // Criar a lista final de cartões ordenados pelo valor total
    const topCreditCards = await Promise.all(
      Array.from(cardTotals.entries())
        .map(async ([nameCard, totalValueMonth]) => {
          // Somar valores parcelados
          const totalValueMonthParcelado = await this.prisma.transation.aggregate({
            _sum: { amount: true },
            where: {
              userId,
              type: 'EXPENSE',
              paymentMethod: 'CREDIT_CARD',
              nameCard,
              Date: { gte: startDate, lt: endDate },
              installments: { gt: 0 },
            },
          });
  
          const totalParceladoMonth = Number(totalValueMonthParcelado._sum.amount) || 0;
  
          // Somar valores restantes de meses futuros
          const totalValueRemainingMonths = await this.prisma.transation.aggregate({
            _sum: { amount: true },
            where: {
              userId,
              type: 'EXPENSE',
              paymentMethod: 'CREDIT_CARD',
              nameCard,
              Date: { gte: new Date() },
            },
          });
  
          const totalRemaining = Number(totalValueRemainingMonths._sum.amount) || 0;
  
          return {
            card: nameCard,
            valorTotalMes: totalValueMonth,
            valorTotalTodosMesesRestantes: totalRemaining + totalParceladoMonth,
          };
        })
    );
  
    // Ordenar pelo valor total do mês e limitar a 5 resultados
    const limitedTopCreditCards = topCreditCards
      .sort((a, b) => b.valorTotalMes - a.valorTotalMes)
      .slice(0, 5);
  
    return { topCredcards: limitedTopCreditCards };
  };

  async getAllBalance(userId: string, date: string) {
    if (!date || (!/^\d{4}-\d{2}-\d{2}$/.test(date) && !/^\d{4}$/.test(date))) {
      throw new Error('Invalid date format. Expected format: YYYY-MM-DD or YYYY');
    }
  
    const isYear = /^\d{4}$/.test(date);
    const year = isYear ? parseInt(date, 10) : parseInt(date.split('-')[0], 10);
    const month = isYear ? 0 : parseInt(date.split('-')[1], 10) - 1;
  
    const startDate = new Date(year, month, 1);
    const endDate = new Date(startDate);
    endDate.setMonth(isYear ? 12 : month + 1);
  
    const calculateSumByType = async (type: 'EXPENSE' | 'INVESTMENT' | 'DEPOSIT') => {
      const result = await this.prisma.transation.aggregate({
        _sum: { amount: true },
        where: { userId, type, Date: { gte: startDate, lt: endDate } },
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
      where: { userId, Date: { gte: startDate, lt: endDate } },
      orderBy: { Date: 'desc' },
      take: 10,
      select: { id: true, category: true, amount: true, type: true, Date: true, name: true },
    });
  
    const anualBalance = [
          { category: 'Balance', percent: null, value: balance },
          { category: 'DEPÓSITOS', percent: depositPercentage, value: totalDeposits },
          { category: 'DESPESAS', percent: expensePercentage, value: totalExpenses },
          { category: 'INVESTIMENTOS', percent: investmentPercentage, value: totalInvestments },
    ];
  
    return {
      totalValues: { totalExpenses, totalInvestments, totalDeposits, balance },
      percentsValues: { expensePercentage, investmentPercentage, depositPercentage },
      topCategories,
      lastTransactions,
      anualBalance,
    };
  } 
}
