/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TransationPaymentMethod,
  TransationPaymentStatus,
  TransationType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma-services/prisma.service';
import { addMonths } from 'date-fns';
import { FixedCostService } from '../fixed-cost/fixed-cost.service';
import { UpdateInstallmentGroupDto } from './dto/update-installment-group.dto';
import { UpdateTransationPaymentStatusDto } from './dto/update-transation-payment-status.dto';
import { UpdateTransationDto } from './dto/update-transation.dto';

@Injectable()
export class TransationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fixedCostService: FixedCostService,
  ) {}

  private normalizeDateInput(value: string | Date) {
    return value instanceof Date ? value : new Date(value);
  }

  private normalizeCardName(value: string | null | undefined) {
    return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private getCardDisplayName(value: string | null | undefined) {
    const normalizedValue = (value ?? '').trim().replace(/\s+/g, ' ');

    return normalizedValue || 'Cartao';
  }

  private getMonthIdFromDate(value: Date) {
    return value.toISOString().slice(0, 7);
  }

  private async getOwnedTransaction(id: string, userId: string) {
    const transaction = await this.prisma.transation.findUnique({ where: { id } });

    if (!transaction || transaction.userId !== userId) {
      throw new NotFoundException('Transação não encontrada.');
    }

    return transaction;
  }

  private parseYearMonthInput(date: string, allowYear = false) {
    const yearOnlyPattern = /^\d{4}$/;
    const yearMonthPattern = /^\d{4}-\d{2}$/;
    const fullDatePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (allowYear && yearOnlyPattern.test(date)) {
      return {
        year: Number.parseInt(date, 10),
        month: 0,
        isYear: true,
      };
    }

    if (yearMonthPattern.test(date) || fullDatePattern.test(date)) {
      const [yearPart, monthPart] = date.split('-');
      const month = Number.parseInt(monthPart, 10);

      if (!Number.isFinite(month) || month < 1 || month > 12) {
        throw new BadRequestException('Invalid month value. Expected range: 01-12');
      }

      return {
        year: Number.parseInt(yearPart, 10),
        month: month - 1,
        isYear: false,
      };
    }

    throw new BadRequestException(
      allowYear
        ? 'Invalid date format. Expected format: YYYY-MM, YYYY-MM-DD or YYYY'
        : 'Invalid date format. Expected format: YYYY-MM or YYYY-MM-DD',
    );
  }

  private supportsInstallments(paymentMethod: TransationPaymentMethod) {
    return (
      paymentMethod === TransationPaymentMethod.CREDIT_CARD ||
      paymentMethod === TransationPaymentMethod.PIX
    );
  }

  private isInstallmentTransaction(transaction: {
    paymentMethod: TransationPaymentMethod;
    installments?: number | null;
  }) {
    return (
      this.supportsInstallments(transaction.paymentMethod) &&
      Number(transaction.installments ?? 0) > 1
    );
  }

  private isEditingProtectedFields(data: UpdateTransationDto) {
    return data.name !== undefined || data.amount !== undefined;
  }

  private getInstallmentSequence(transaction: {
    installmentInfo?: string | null;
    Date: Date;
    createdAt?: Date;
  }) {
    const sequence = Number.parseInt(transaction.installmentInfo?.split('/')[0] ?? '', 10);

    if (Number.isFinite(sequence) && sequence > 0) {
      return sequence;
    }

    return Number.MAX_SAFE_INTEGER;
  }

  private async resolveInstallmentGroupCard(
    paymentMethod: TransationPaymentMethod,
    cardId?: string,
  ) {
    if (paymentMethod !== TransationPaymentMethod.CREDIT_CARD) {
      return {
        cardId: null,
        nameCard: null,
      };
    }

    if (!cardId) {
      throw new BadRequestException('O cardId e obrigatorio para pagamentos com cartao de credito.');
    }

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
    });

    if (!card) {
      throw new BadRequestException('Cartão não encontrado para o cardId informado.');
    }

    return {
      cardId,
      nameCard: card.name,
    };
  }

  private buildInstallmentGroupEntries(
    baseTransaction: Prisma.TransationUncheckedCreateInput,
    startDate: Date,
    installments: number,
    totalAmount: string,
  ) {
    const installmentAmount = Number(totalAmount) / installments;

    return Array.from({ length: installments }, (_, index) => ({
      ...baseTransaction,
      amount: installmentAmount,
      installments,
      installmentInfo: `${index + 1}/${installments}`,
      Date: addMonths(startDate, index),
    }));
  }

  private async getInstallmentGroupTransaction(id: string, userId: string) {
    const transaction = await this.getOwnedTransaction(id, userId);

    if (!this.isInstallmentTransaction(transaction) || !transaction.installmentGroupId) {
      throw new BadRequestException(
        'A transacao informada nao pertence a um grupo parcelado editavel.',
      );
    }

    return transaction;
  }

  private async findOpenInstallmentsToDelete(transaction: {
    id: string;
    userId: string;
    name: string;
    cardId?: string | null;
    amount: Prisma.Decimal;
    createdAt: Date;
    installments?: number | null;
    installmentGroupId?: string | null;
    paymentMethod: TransationPaymentMethod;
  }) {
    if (!this.isInstallmentTransaction(transaction)) {
      return [];
    }

    if (transaction.installmentGroupId) {
      return this.prisma.transation.findMany({
        where: {
          installmentGroupId: transaction.installmentGroupId,
          paymentStatus: TransationPaymentStatus.PENDING,
        },
        select: { id: true },
      });
    }

    // Legacy fallback for installment purchases created before installmentGroupId existed.
    const createdAtWindowStart = new Date(transaction.createdAt.getTime() - 60_000);
    const createdAtWindowEnd = new Date(transaction.createdAt.getTime() + 60_000);

    return this.prisma.transation.findMany({
      where: {
        userId: transaction.userId,
        paymentMethod: transaction.paymentMethod,
        name: transaction.name,
        cardId: transaction.cardId ?? null,
        amount: transaction.amount,
        installments: transaction.installments ?? null,
        createdAt: {
          gte: createdAtWindowStart,
          lte: createdAtWindowEnd,
        },
        paymentStatus: TransationPaymentStatus.PENDING,
      },
      select: { id: true },
    });
  }

  async create(data: Prisma.TransationCreateInput) {
    if (
      data.paymentMethod === TransationPaymentMethod.CREDIT_CARD &&
      (!data.installments || data.installments < 1)
    ) {
      throw new BadRequestException(
        'A quantidade de parcelas é obrigatória e deve ser maior que 0 para pagamentos com cartão de crédito.',
      );
    }

    if (
      data.paymentMethod === TransationPaymentMethod.PIX &&
      data.installments !== undefined &&
      data.installments < 1
    ) {
      throw new BadRequestException(
        'A quantidade de parcelas deve ser maior que 0 para pagamentos parcelados no PIX.',
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
    const normalizedDate = this.normalizeDateInput(data.Date as string | Date);
  
    if (this.supportsInstallments(data.paymentMethod) && data.installments > 1) {
      const installmentValue = Number(data.amount) / data.installments;
      const startDate = normalizedDate;
      const installmentGroupId = randomUUID();
  
      for (let i = 1; i <= data.installments; i++) {
        transactions.push(
          this.prisma.transation.create({
            data: {
              ...data,
              amount: installmentValue,
              installmentInfo: `${i}/${data.installments}`,
              installmentGroupId,
              Date: addMonths(startDate, i - 1),
            },
          })
        );
      }
  
      return Promise.all(transactions);
    }
    return this.prisma.transation.create({
      data: {
        ...data,
        Date: normalizedDate,
      },
    });
  };  

  async findAllByUserId(userId: string) {
    return this.prisma.transation.findMany({
      where: { userId },
    });
  }

  async findOne(id: string, userId: string) {
    return this.getOwnedTransaction(id, userId);
  }

  async findByUserIdAndMonth(
    userId: string,
    date: string,
    page: number = 1,
    pageSize: number = 10,
    paymentStatus?: TransationPaymentStatus,
  ) {
    const { year, month } = this.parseYearMonthInput(date);

    const startDate = new Date(year, month, 1);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    if (paymentStatus && !Object.values(TransationPaymentStatus).includes(paymentStatus)) {
      throw new BadRequestException('O status de pagamento informado é inválido.');
    }

    const where: Prisma.TransationWhereInput = {
      userId,
      Date: {
        gte: startDate,
        lt: endDate,
      },
      ...(paymentStatus ? { paymentStatus } : {}),
    };
  
    // Cálculo de skip para paginar corretamente
    const skip = (page - 1) * pageSize;
  
    // Obter os registros paginados
    const transactions = await this.prisma.transation.findMany({
      where,
      skip,
      take: pageSize,
    });
  
    // Obter o total de registros para calcular o total de páginas
    const totalRecords = await this.prisma.transation.count({
      where,
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

  private async findAllTransactionsByUserIdAndMonth(userId: string, date: string) {
    const pageSize = 100;
    const firstPage = await this.findByUserIdAndMonth(userId, date, 1, pageSize);
    const totalPages = Math.max(1, firstPage.totalPages ?? 1);
    const transactions = [...(firstPage.transactions ?? [])];

    if (totalPages === 1) {
      return transactions;
    }

    for (let page = 2; page <= totalPages; page += 1) {
      const currentPage = await this.findByUserIdAndMonth(userId, date, page, pageSize);
      transactions.push(...(currentPage.transactions ?? []));
    }

    return transactions;
  }

  async getDashboardMonthlyData(userId: string, month: string) {
    const [summary, fixedCosts, transactions, creditCard] = await Promise.all([
      this.getAllBalance(userId, month),
      this.fixedCostService.findByUserIdAndMonth(userId, month),
      this.findAllTransactionsByUserIdAndMonth(userId, month),
      this.getTopCreditCardsByMonth(userId, month).catch(() => ({ topCredcards: [] })),
    ]);

    return {
      summary,
      fixedCosts,
      transactions,
      creditCard,
    };
  }

  async update(id: string, userId: string, data: UpdateTransationDto) {
    const transaction = await this.getOwnedTransaction(id, userId);

    if (
      this.isEditingProtectedFields(data) &&
      (this.isInstallmentTransaction(transaction) ||
        transaction.paymentStatus === TransationPaymentStatus.PAID)
    ) {
      throw new BadRequestException(
        'Nao e permitido editar nome ou valor de transacoes pagas ou parceladas.',
      );
    }

    return this.prisma.transation.update({
      where: { id },
      data: {
        ...data,
      },
    });
  }

  async updateInstallmentGroup(
    id: string,
    userId: string,
    data: UpdateInstallmentGroupDto,
  ) {
    if (!this.supportsInstallments(data.paymentMethod)) {
      throw new BadRequestException(
        'O metodo de pagamento informado nao suporta edicao de grupo parcelado.',
      );
    }

    const anchorTransaction = await this.getInstallmentGroupTransaction(id, userId);
    const cardData = await this.resolveInstallmentGroupCard(data.paymentMethod, data.cardId);
    const startDate = this.normalizeDateInput(data.Date);

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.transation.findMany({
        where: {
          installmentGroupId: anchorTransaction.installmentGroupId,
          userId,
        },
      });

      if (group.length === 0) {
        throw new NotFoundException('Grupo parcelado não encontrado.');
      }

      const orderedGroup = [...group].sort((left, right) => {
        const leftSequence = this.getInstallmentSequence(left);
        const rightSequence = this.getInstallmentSequence(right);

        if (leftSequence !== rightSequence) {
          return leftSequence - rightSequence;
        }

        return left.Date.getTime() - right.Date.getTime();
      });

      const baseTransaction: Prisma.TransationUncheckedCreateInput = {
        userId,
        name: data.name,
        type: anchorTransaction.type,
        amount: Number(data.amount) / data.installments,
        category: anchorTransaction.category,
        paymentMethod: data.paymentMethod,
        paymentStatus: TransationPaymentStatus.PENDING,
        paidAt: null,
        isFixed: anchorTransaction.isFixed,
        installments: data.installments,
        installmentInfo: null,
        installmentGroupId: anchorTransaction.installmentGroupId,
        nameCard: cardData.nameCard,
        cardId: cardData.cardId,
        Date: startDate,
        withdrawal: anchorTransaction.withdrawal,
      };

      const recalculatedEntries = this.buildInstallmentGroupEntries(
        baseTransaction,
        startDate,
        data.installments,
        data.amount,
      );

      const updates = orderedGroup
        .slice(0, recalculatedEntries.length)
        .map((transaction, index) =>
          tx.transation.update({
            where: { id: transaction.id },
            data: {
              name: recalculatedEntries[index].name,
              amount: recalculatedEntries[index].amount,
              Date: recalculatedEntries[index].Date,
              installments: recalculatedEntries[index].installments,
              installmentInfo: recalculatedEntries[index].installmentInfo,
              paymentMethod: recalculatedEntries[index].paymentMethod,
              cardId: recalculatedEntries[index].cardId,
              nameCard: recalculatedEntries[index].nameCard,
            },
          }),
        );

      const creates = recalculatedEntries
        .slice(orderedGroup.length)
        .map((entry) =>
          tx.transation.create({
            data: entry,
          }),
        );

      const trailingInstallments = orderedGroup.slice(recalculatedEntries.length);
      if (trailingInstallments.length > 0) {
        await tx.transation.deleteMany({
          where: {
            id: {
              in: trailingInstallments.map((transaction) => transaction.id),
            },
          },
        });
      }

      await Promise.all([...updates, ...creates]);

      return tx.transation.findMany({
        where: {
          installmentGroupId: anchorTransaction.installmentGroupId,
          userId,
        },
        orderBy: [{ Date: 'asc' }, { createdAt: 'asc' }],
      });
    });
  }

  async updatePaymentStatus(
    id: string,
    userId: string,
    data: UpdateTransationPaymentStatusDto,
  ) {
    const transaction = await this.getOwnedTransaction(id, userId);

    const paidAt = data.paymentStatus === TransationPaymentStatus.PAID
      ? (data.paidAt ? new Date(data.paidAt) : new Date())
      : null;

    return this.prisma.transation.update({
      where: { id },
      data: {
        paymentStatus: data.paymentStatus,
        paidAt,
      },
    });
  }

  async delete(id: string, userId: string) {
    const transaction = await this.getOwnedTransaction(id, userId);

    if (this.isInstallmentTransaction(transaction)) {
      const openInstallments = await this.findOpenInstallmentsToDelete(transaction);

      if (openInstallments.length === 0) {
        return { deletedCount: 0, preservedPaidCount: transaction.installments ?? 0 };
      }

      const deleted = await this.prisma.transation.deleteMany({
        where: {
          id: {
            in: openInstallments.map((installment) => installment.id),
          },
        },
      });

      return {
        deletedCount: deleted.count,
        preservedPaidCount: Math.max((transaction.installments ?? 0) - deleted.count, 0),
      };
    }

    const deletedTransaction = await this.prisma.transation.delete({ where: { id } });

    return {
      deletedCount: 1,
      deletedTransactionId: deletedTransaction.id,
      preservedPaidCount: 0,
    };
  }
 
  async findByNameCard(userId: string, nameCard: string) {
    const card = await this.prisma.transation.findFirst({
      where: {
        userId,
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

  async findTransactionsByCard(userId: string, nameCard: string) {
    const normalizedCardName = nameCard.trim();

    if (!normalizedCardName) {
      throw new BadRequestException('O nome do cartao e obrigatorio.');
    }

    const transactions = await this.prisma.transation.findMany({
      where: {
        userId,
        type: TransationType.EXPENSE,
        paymentMethod: TransationPaymentMethod.CREDIT_CARD,
      },
      orderBy: [
        { Date: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    const normalizedRequestedCardName = this.normalizeCardName(normalizedCardName);

    return transactions.filter(
      (transaction) =>
        this.normalizeCardName(transaction.nameCard) === normalizedRequestedCardName,
    );
  }

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
    const { year, month } = this.parseYearMonthInput(date);
    const selectedMonthId = `${year}-${`${month + 1}`.padStart(2, '0')}`;

    const transactions = await this.prisma.transation.findMany({
      where: {
        userId,
        type: TransationType.EXPENSE,
        paymentMethod: TransationPaymentMethod.CREDIT_CARD,
      },
      orderBy: [
        { Date: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    const groupedCards = new Map<
      string,
      {
        card: string;
        valorTotalMes: number;
        valorTotalTodosMesesRestantes: number;
        valorParceladoMes: number;
      }
    >();

    for (const transaction of transactions) {
      const normalizedName = this.normalizeCardName(transaction.nameCard);
      const groupKey = normalizedName || 'cartao';
      const amount = Number(transaction.amount) || 0;
      const isPending = transaction.paymentStatus === TransationPaymentStatus.PENDING;
      const isInSelectedMonth = this.getMonthIdFromDate(transaction.Date) === selectedMonthId;

      const existingGroup = groupedCards.get(groupKey) ?? {
        card: this.getCardDisplayName(transaction.nameCard),
        valorTotalMes: 0,
        valorTotalTodosMesesRestantes: 0,
        valorParceladoMes: 0,
      };

      // valorTotalTodosMesesRestantes: apenas pendentes de qualquer mês
      if (isPending) {
        existingGroup.valorTotalTodosMesesRestantes += amount;
      }

      // valorTotalMes: todas as transações do mês selecionado (pagas + pendentes)
      if (isInSelectedMonth) {
        existingGroup.valorTotalMes += amount;

        if (Number(transaction.installments ?? 0) > 1) {
          existingGroup.valorParceladoMes += amount;
        }
      }

      groupedCards.set(groupKey, existingGroup);
    }

    const sortedTopCreditCards = Array.from(groupedCards.values())
      .filter((card) => card.valorTotalMes > 0 || card.valorTotalTodosMesesRestantes > 0)
      .sort((a, b) => b.valorTotalTodosMesesRestantes - a.valorTotalTodosMesesRestantes);

    return { topCredcards: sortedTopCreditCards };
  };  

  async getAllBalance(userId: string, date: string) {
    const { year, month, isYear } = this.parseYearMonthInput(date, true);
  
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
