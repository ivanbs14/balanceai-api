/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransationPaymentMethod, TransationType } from '@prisma/client';
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
  
    if (data.type === TransationType.EXPENSE) {
      if (
        data.withdrawal !== TransationType.DEPOSIT &&
        data.withdrawal !== TransationType.INVESTMENT
      ) {
        throw new BadRequestException(
          "Para transações do tipo 'EXPENSE', o campo 'withdrawal' deve ser 'DEPOSIT' ou 'INVESTMENT'."
        );
      }
    } else {
      data.withdrawal = null;
    }
  
    if (data.paymentMethod === TransationPaymentMethod.CREDIT_CARD && data.cardId) {
      const card = await this.prisma.card.findUnique({
        where: { id: data.cardId },
      });
  
      if (!card) {
        throw new BadRequestException('Cartão não encontrado para o cardId informado.');
      }
  
      data.nameCard = card.name;
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
  };  

  async findAll() {
    return this.prisma.transation.findMany();
  }

  async findOne(id: string) {
    return this.prisma.transation.findUnique({ where: { id } });
  }

  async findByUserIdAndMonth(userId: string, date: string, page: number = 1, pageSize: number = 10) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid date format. Expected format: YYYY-MM-DD');
    }
  
    const [year, month] = date.split('-');
    const targetMonth = parseInt(month, 10) - 1;
  
    const startDate = new Date(Number(year), targetMonth, 1);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
  
    // Cálculo de skip para paginar corretamente
    const skip = (page - 1) * pageSize;
  
    // Obter os registros paginados
    const transactions = await this.prisma.transation.findMany({
      where: {
        userId,
        Date: {
          gte: startDate,
          lt: endDate,
        },
      },
      skip,
      take: pageSize,
    });
  
    // Obter o total de registros para calcular o total de páginas
    const totalRecords = await this.prisma.transation.count({
      where: {
        userId,
        Date: {
          gte: startDate,
          lt: endDate,
        },
      },
    });
  
    // Calcular o total de páginas
    const totalPages = Math.ceil(totalRecords / pageSize);
  
    return {
      transactions,
      totalPages,
      currentPage: page,
      pageSize,
    };
  };  

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
  
    const cardTotals = new Map<string, number>();
  
    for (const aggregate of creditCardAggregates) {
      const totalValueMonth = Number(aggregate._sum.amount) || 0;
      cardTotals.set(
        aggregate.nameCard,
        (cardTotals.get(aggregate.nameCard) || 0) + totalValueMonth
      );
    }
  
    const topCreditCards = await Promise.all(
      Array.from(cardTotals.entries()).map(async ([nameCard, totalValueMonth]) => {
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
        const totalValueRemainingMonths = await this.prisma.transation.aggregate({
          _sum: { amount: true },
          where: {
            userId,
            type: 'EXPENSE',
            paymentMethod: 'CREDIT_CARD',
            nameCard,
            Date: { gte: endDate },
          },
        });
  
        const totalRemaining = Number(totalValueRemainingMonths._sum.amount) || 0;
  
        return {
          card: nameCard,
          valorTotalMes: totalValueMonth,
          valorTotalTodosMesesRestantes: totalRemaining,
          valorParceladoMes: totalParceladoMonth,
        };
      })
    );
  
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
    const endDate = new Date(year, isYear ? 12 : month + 1, 1);
  
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);
  
    const [
      transactionAggregates,
      totalTransactionsCount,
      categoryAggregates,
      lastTransactions,
      annualAggregates,
      withdrawalAggregates,
      annualWithdrawalAggregates, // NOVO
    ] = await Promise.all([
      this.prisma.transation.groupBy({
        by: ['type'],
        _sum: { amount: true },
        where: { userId, Date: { gte: startDate, lt: endDate } },
      }),
      this.prisma.transation.count({
        where: { userId, Date: { gte: startDate, lt: endDate } },
      }),
      this.prisma.transation.groupBy({
        by: ['category'],
        _sum: { amount: true },
        _count: { id: true },
        where: { userId, Date: { gte: startDate, lt: endDate } },
        orderBy: { _count: { id: 'desc' } },
        take: 4,
      }),
      this.prisma.transation.findMany({
        where: { userId, Date: { gte: startDate, lt: endDate } },
        orderBy: { Date: 'desc' },
        take: 10,
        select: { id: true, category: true, amount: true, type: true, Date: true, name: true },
      }),
      this.prisma.transation.groupBy({
        by: ['type'],
        _sum: { amount: true },
        where: { userId, Date: { gte: startOfYear, lt: endOfYear } },
      }),
      this.prisma.transation.groupBy({
        by: ['type', 'withdrawal'],
        _sum: { amount: true },
        where: { userId, Date: { gte: startDate, lt: endDate } },
      }),
      this.prisma.transation.groupBy({ // NOVO: agregação anual por tipo + withdrawal
        by: ['type', 'withdrawal'],
        _sum: { amount: true },
        where: { userId, Date: { gte: startOfYear, lt: endOfYear } },
      }),
    ]);
  
    const getSumWithWithdrawal = (
      list: (Prisma.PickEnumerable<Prisma.TransationGroupByOutputType, ['type', 'withdrawal']> & {
        _sum: { amount: Prisma.Decimal };
      })[],
      type: string,
      withdrawal: string
    ) =>
      list.find(t => t.type === type && t.withdrawal === withdrawal)?._sum.amount.toNumber() || 0;
  
    const getSum = (list: typeof transactionAggregates, type: string) =>
      Number(list.find(t => t.type === type)?._sum.amount) || 0;
  
    /* const totalExpensesDeposits = getSumWithWithdrawal(withdrawalAggregates, 'EXPENSE', 'DEPOSIT'); */
    const totalExpensesInvestments = getSumWithWithdrawal(withdrawalAggregates, 'EXPENSE', 'INVESTMENT');
    const totalExpenses = getSum(transactionAggregates, 'EXPENSE');
    const totalInvestmentsByBalance = getSum(transactionAggregates, 'INVESTMENT');
    const totalInvestments = getSum(transactionAggregates, 'INVESTMENT') - totalExpensesInvestments;
    const totalDeposits = getSum(transactionAggregates, 'DEPOSIT');
  
    const totalTransactionsAmount = totalDeposits - totalInvestments - totalExpenses;
    const balance = totalDeposits - (totalExpenses + totalInvestmentsByBalance);
  
    const calculatePercentage = (value: number, total: number) =>
      total ? Math.round((value / total) * 1000) / 10 : 0;
  
    const expensePercentage = calculatePercentage(totalExpenses, totalDeposits);
    const investmentPercentage = calculatePercentage(totalInvestments, totalDeposits);
    const depositPercentage = calculatePercentage(totalTransactionsAmount, totalDeposits);
  
    const topCategories = categoryAggregates.reduce((acc, category) => {
      if (category.category !== 'SALARY') {
        acc.push({
          category: category.category,
          percent: calculatePercentage(category._count.id, totalTransactionsCount),
          value: Number(category._sum.amount) || 0,
        });
      }
      return acc;
    }, [] as { category: string; percent: number; value: number }[]);
  
    const annualExpensesValue = getSum(annualAggregates, 'EXPENSE');
    const annualInvestmentsValue = getSum(annualAggregates, 'INVESTMENT');
    const annualDepositsValue = getSum(annualAggregates, 'DEPOSIT');
  
    const annualExpensesWithdrawnForInvestment = getSumWithWithdrawal(
      annualWithdrawalAggregates,
      'EXPENSE',
      'INVESTMENT'
    );
  
    const annualInvestmentsValueAdjusted = annualInvestmentsValue - annualExpensesWithdrawnForInvestment;
  
    const totalAnnualTransactions =
      annualDepositsValue + annualExpensesValue + annualInvestmentsValue;
  
    const annualBalanceValue =
      annualDepositsValue - (annualExpensesValue + annualInvestmentsValue);
  
    const anualBalance = [
      { category: 'Balance', percent: null, value: annualBalanceValue },
      {
        category: 'DEPÓSITOS',
        percent: calculatePercentage(annualDepositsValue, totalAnnualTransactions),
        value: annualDepositsValue,
      },
      {
        category: 'DESPESAS',
        percent: calculatePercentage(annualExpensesValue, totalAnnualTransactions),
        value: annualExpensesValue,
      },
      {
        category: 'INVESTIMENTOS',
        percent: calculatePercentage(annualInvestmentsValueAdjusted, totalAnnualTransactions),
        value: annualInvestmentsValueAdjusted,
      },
    ];
  
    return {
      totalValues: { totalExpenses, totalInvestments, totalDeposits, balance },
      percentsValues: { expensePercentage, investmentPercentage, depositPercentage },
      topCategories,
      lastTransactions,
      anualBalance,
    };
  };  
};
