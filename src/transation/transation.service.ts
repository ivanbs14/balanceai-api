/* eslint-disable prettier/prettier */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  FixedCostMonthlyStatus,
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
import { allocateInstallmentAmounts } from './installment-amounts';

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
    // Datas civis enviadas como YYYY-MM-DD são persistidas em meia-noite UTC.
    // O fuso local não deve deslocar o primeiro dia para o mês anterior.
    return `${value.getUTCFullYear()}-${`${value.getUTCMonth() + 1}`.padStart(2, '0')}`;
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

  private async resolveOwnedCard(
    paymentMethod: TransationPaymentMethod,
    cardId: string | null | undefined,
    userId: string,
  ) {
    if (paymentMethod !== TransationPaymentMethod.CREDIT_CARD) {
      if (cardId !== undefined) {
        throw new BadRequestException('O cardId só pode ser informado para pagamentos com cartão de crédito.');
      }

      return {
        cardId: null,
        nameCard: null,
      };
    }

    if (typeof cardId !== 'string' || !cardId.trim()) {
      throw new BadRequestException('O cardId e obrigatorio para pagamentos com cartao de credito.');
    }

    const card = await this.prisma.card.findFirst({
      where: { id: cardId, userId },
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
    totalAmount: Prisma.Decimal.Value | Prisma.DecimalJsLike,
  ) {
    const amounts = allocateInstallmentAmounts(totalAmount, installments);

    return Array.from({ length: installments }, (_, index) => ({
      ...baseTransaction,
      amount: amounts[index],
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

  async getInstallmentGroupSummary(id: string, userId: string) {
    const anchor = await this.getInstallmentGroupTransaction(id, userId);
    const group = await this.prisma.transation.findMany({
      where: { installmentGroupId: anchor.installmentGroupId, userId },
    });

    if (group.length === 0) {
      throw new NotFoundException('Grupo parcelado não encontrado.');
    }

    const pending = group.filter(
      (installment) => installment.paymentStatus === TransationPaymentStatus.PENDING,
    );
    if (pending.length === 0) {
      throw new ConflictException('Não há parcelas pendentes para editar neste grupo.');
    }

    const orderedGroup = [...pending].sort((left, right) => {
      const sequenceDifference = this.getInstallmentSequence(left) - this.getInstallmentSequence(right);
      return sequenceDifference || left.Date.getTime() - right.Date.getTime();
    });
    const first = orderedGroup[0];
    const total = orderedGroup.reduce(
      (sum, installment) => sum.plus(installment.amount),
      new Prisma.Decimal(0),
    );

    return {
      name: first.name,
      totalAmount: total.toFixed(2),
      startDate: first.Date.toISOString().slice(0, 10),
      installments: pending.length,
      paidInstallments: group.length - pending.length,
      paymentMethod: first.paymentMethod,
      cardId: first.cardId,
      cardName: first.nameCard,
    };
  }

  private getOpenInstallmentsDeleteWhere(transaction: {
    id: string;
    userId: string;
    name: string;
    cardId?: string | null;
    amount: Prisma.Decimal;
    createdAt: Date;
    installments?: number | null;
    installmentGroupId?: string | null;
    paymentMethod: TransationPaymentMethod;
  }): Prisma.TransationWhereInput {
    if (transaction.installmentGroupId) {
      return {
        userId: transaction.userId,
        installmentGroupId: transaction.installmentGroupId,
        paymentStatus: TransationPaymentStatus.PENDING,
      };
    }

    // Legacy fallback for installment purchases created before installmentGroupId existed.
    const createdAtWindowStart = new Date(transaction.createdAt.getTime() - 60_000);
    const createdAtWindowEnd = new Date(transaction.createdAt.getTime() + 60_000);

    return {
      userId: transaction.userId,
      installmentGroupId: null,
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
    };
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
  
    const cardData = await this.resolveOwnedCard(data.paymentMethod, data.cardId, data.userId);
    data.cardId = cardData.cardId;
    data.nameCard = cardData.nameCard;
  
    const normalizedDate = this.normalizeDateInput(data.Date as string | Date);
  
    if (this.supportsInstallments(data.paymentMethod) && data.installments > 1) {
      const installmentGroupId = randomUUID();
      const entries = this.buildInstallmentGroupEntries(
        { ...data, installmentGroupId },
        normalizedDate,
        data.installments,
        data.amount,
      );

      return this.prisma.$transaction(async (tx) => {
        const created = [];
        for (const entry of entries) {
          created.push(await tx.transation.create({ data: entry }));
        }
        return created;
      });
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
    const cardData = await this.resolveOwnedCard(data.paymentMethod, data.cardId, userId);
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

      const paid = group.filter(
        (installment) => installment.paymentStatus === TransationPaymentStatus.PAID,
      );
      const pending = group.filter(
        (installment) => installment.paymentStatus === TransationPaymentStatus.PENDING,
      );
      if (pending.length === 0) {
        throw new ConflictException('Não há parcelas pendentes para editar neste grupo.');
      }
      if (paid.length === 0 && data.installments < 2) {
        throw new BadRequestException('Um grupo parcelado sem pagamentos exige ao menos duas parcelas.');
      }

      const orderedGroup = [...pending].sort((left, right) => {
        const leftSequence = this.getInstallmentSequence(left);
        const rightSequence = this.getInstallmentSequence(right);

        if (leftSequence !== rightSequence) {
          return leftSequence - rightSequence;
        }

        return left.Date.getTime() - right.Date.getTime();
      });

      const totalInstallments = paid.length + data.installments;
      if (totalInstallments > 24) {
        throw new BadRequestException('O grupo pode ter no máximo 24 parcelas no total.');
      }
      const paidSequences = paid.map((installment) => this.getInstallmentSequence(installment));
      const occupiedSequences = new Set(paidSequences);
      if (
        occupiedSequences.size !== paid.length ||
        paidSequences.some((sequence) => sequence > totalInstallments)
      ) {
        throw new BadRequestException(
          'A quantidade informada conflita com a numeração das parcelas pagas.',
        );
      }
      const pendingSequences = Array.from(
        { length: totalInstallments },
        (_, index) => index + 1,
      ).filter((sequence) => !occupiedSequences.has(sequence));

      const template = orderedGroup[0];
      const baseTransaction: Prisma.TransationUncheckedCreateInput = {
        userId,
        name: data.name,
        type: template.type,
        amount: data.amount,
        category: template.category,
        paymentMethod: data.paymentMethod,
        paymentStatus: TransationPaymentStatus.PENDING,
        paidAt: null,
        isFixed: template.isFixed,
        installments: totalInstallments,
        installmentInfo: null,
        installmentGroupId: anchorTransaction.installmentGroupId,
        nameCard: cardData.nameCard,
        cardId: cardData.cardId,
        Date: startDate,
        withdrawal: template.withdrawal,
      };

      const recalculatedEntries = this.buildInstallmentGroupEntries(
        baseTransaction,
        startDate,
        data.installments,
        data.amount,
      ).map((entry, index) => ({
        ...entry,
        installments: totalInstallments,
        installmentInfo: `${pendingSequences[index]}/${totalInstallments}`,
      }));

      for (const [index, transaction] of orderedGroup.slice(0, recalculatedEntries.length).entries()) {
        const entry = recalculatedEntries[index];
        const updated = await tx.transation.updateMany({
          where: {
            id: transaction.id,
            userId,
            installmentGroupId: anchorTransaction.installmentGroupId,
            paymentStatus: TransationPaymentStatus.PENDING,
          },
          data: {
            name: entry.name,
            amount: entry.amount,
            Date: entry.Date,
            installments: entry.installments,
            installmentInfo: entry.installmentInfo,
            paymentMethod: entry.paymentMethod,
            cardId: entry.cardId,
            nameCard: entry.nameCard,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('Uma parcela foi paga durante a edição. Recarregue o grupo.');
        }
      }

      const trailingInstallments = orderedGroup.slice(recalculatedEntries.length);
      if (trailingInstallments.length > 0) {
        const deleted = await tx.transation.deleteMany({
          where: {
            id: { in: trailingInstallments.map((transaction) => transaction.id) },
            userId,
            installmentGroupId: anchorTransaction.installmentGroupId,
            paymentStatus: TransationPaymentStatus.PENDING,
          },
        });
        if (deleted.count !== trailingInstallments.length) {
          throw new ConflictException('Uma parcela foi paga durante a edição. Recarregue o grupo.');
        }
      }

      for (const entry of recalculatedEntries.slice(orderedGroup.length)) {
        await tx.transation.create({ data: entry });
      }

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
    await this.getOwnedTransaction(id, userId);

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
      const deleted = await this.prisma.transation.deleteMany({
        where: this.getOpenInstallmentsDeleteWhere(transaction),
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
        paymentStatus: TransationPaymentStatus.PENDING,
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
      categoryAggregates,
      lastTransactions,
      annualAggregates,
      withdrawalAggregates,
      annualWithdrawalAggregates,
    ] = await Promise.all([
      this.prisma.transation.groupBy({
        by: ['type', 'paymentStatus'],
        _sum: { amount: true },
        where: { userId, Date: { gte: startDate, lt: endDate } },
      }),
      this.prisma.transation.groupBy({
        by: ['category'],
        _sum: { amount: true },
        _count: { id: true },
        where: {
          userId,
          type: TransationType.EXPENSE,
          paymentStatus: TransationPaymentStatus.PAID,
          Date: { gte: startDate, lt: endDate },
        },
      }),
      this.prisma.transation.findMany({
        where: { userId, Date: { gte: startDate, lt: endDate } },
        orderBy: { Date: 'desc' },
        take: 10,
        select: { id: true, category: true, amount: true, type: true, Date: true, name: true },
      }),
      this.prisma.transation.groupBy({
        by: ['type', 'paymentStatus'],
        _sum: { amount: true },
        where: { userId, Date: { gte: startOfYear, lt: endOfYear } },
      }),
      this.prisma.transation.groupBy({
        by: ['type', 'withdrawal', 'paymentStatus'],
        _sum: { amount: true },
        where: { userId, Date: { gte: startDate, lt: endDate } },
      }),
      this.prisma.transation.groupBy({
        by: ['type', 'withdrawal', 'paymentStatus'],
        _sum: { amount: true },
        where: { userId, Date: { gte: startOfYear, lt: endOfYear } },
      }),
    ]);
  
    const cents = (value: Prisma.Decimal | number | string | null | undefined) =>
      Math.round(Number(value ?? 0) * 100);
    const amount = (valueInCents: number) => valueInCents / 100;
    const getSum = (
      list: typeof transactionAggregates,
      type: TransationType,
      status?: TransationPaymentStatus,
    ) => list.reduce((sum, row) =>
      sum + (row.type === type && (!status || row.paymentStatus === status) ? cents(row._sum.amount) : 0), 0);
    const getWithdrawn = (
      list: typeof withdrawalAggregates,
      status: TransationPaymentStatus,
    ) => list.reduce((sum, row) =>
      sum + (row.type === TransationType.EXPENSE && row.withdrawal === TransationType.INVESTMENT && row.paymentStatus === status
        ? cents(row._sum.amount) : 0), 0);

    const competences = isYear
      ? Array.from({ length: 12 }, (_, index) => `${year}-${`${index + 1}`.padStart(2, '0')}`)
      : [`${year}-${`${month + 1}`.padStart(2, '0')}`];
    const fixedCostMonths = await Promise.all(
      competences.map((competence) => this.fixedCostService.findByUserIdAndMonth(userId, competence)),
    );
    let paidFixedCents = 0;
    let pendingFixedCents = 0;
    const paidFixedCategories = new Map<string, number>();
    for (const fixedCostMonth of fixedCostMonths) {
      for (const fixedCost of fixedCostMonth.data ?? []) {
        const value = cents(fixedCost.monthly?.amount ?? fixedCost.defaultAmount);
        if (fixedCost.monthly?.status === 'PAID') {
          paidFixedCents += value;
          paidFixedCategories.set(fixedCost.category, (paidFixedCategories.get(fixedCost.category) ?? 0) + value);
        } else {
          pendingFixedCents += value;
        }
      }
    }
    const annualFixedPaidCents = isYear
      ? paidFixedCents
      : cents((await this.prisma.fixedCostMonthly.aggregate({
          _sum: { amount: true },
          where: {
            status: FixedCostMonthlyStatus.PAID,
            competence: { gte: `${year}-01`, lte: `${year}-12` },
            fixedCost: { userId },
          },
        }))._sum.amount);

    const paidTransactionCents = getSum(transactionAggregates, TransationType.EXPENSE, TransationPaymentStatus.PAID);
    const pendingTransactionCents = getSum(transactionAggregates, TransationType.EXPENSE, TransationPaymentStatus.PENDING);
    const paidInvestmentWithdrawals = getWithdrawn(withdrawalAggregates, TransationPaymentStatus.PAID);
    const pendingInvestmentWithdrawals = getWithdrawn(withdrawalAggregates, TransationPaymentStatus.PENDING);
    const depositCents = getSum(transactionAggregates, TransationType.DEPOSIT);
    const investedCents = getSum(transactionAggregates, TransationType.INVESTMENT);
    const realizedExpenseCents = paidTransactionCents + paidFixedCents;
    const forecastExpenseCents = pendingTransactionCents + pendingFixedCents;
    const investedPositionCents = investedCents - paidInvestmentWithdrawals;
    const availableBalanceCents = depositCents - investedCents - (paidTransactionCents - paidInvestmentWithdrawals) - paidFixedCents;
    const projectedBalanceCents = availableBalanceCents - (pendingTransactionCents - pendingInvestmentWithdrawals) - pendingFixedCents;

    const totalExpenses = amount(realizedExpenseCents);
    const forecastExpenses = amount(forecastExpenseCents);
    const totalInvestments = amount(investedPositionCents);
    const totalDeposits = amount(depositCents);
    const balance = amount(availableBalanceCents);
    const calculatePercentage = (value: number, total: number) =>
      total ? Math.round((value / total) * 1000) / 10 : 0;
    const expensePercentage = calculatePercentage(totalExpenses, totalDeposits);
    const investmentPercentage = calculatePercentage(totalInvestments, totalDeposits);
    const depositPercentage = calculatePercentage(balance, totalDeposits);
  
    const categoryTotals = new Map<string, number>();
    for (const category of categoryAggregates) {
      categoryTotals.set(category.category, cents(category._sum.amount));
    }
    for (const [category, value] of paidFixedCategories) {
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + value);
    }
    const topCategories = [...categoryTotals]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([category, value]) => ({
        category,
        percent: calculatePercentage(value, realizedExpenseCents),
        value: amount(value),
      }));

    const annualPaidExpenseCents = getSum(annualAggregates, TransationType.EXPENSE, TransationPaymentStatus.PAID);
    const annualPaidInvestmentWithdrawals = getWithdrawn(annualWithdrawalAggregates, TransationPaymentStatus.PAID);
    const annualInvestedCents = getSum(annualAggregates, TransationType.INVESTMENT);
    const annualDepositCents = getSum(annualAggregates, TransationType.DEPOSIT);
    const annualExpensesValue = amount(annualPaidExpenseCents + annualFixedPaidCents);
    const annualInvestmentsValueAdjusted = amount(annualInvestedCents - annualPaidInvestmentWithdrawals);
    const annualDepositsValue = amount(annualDepositCents);
    const totalAnnualTransactions =
      annualDepositsValue + annualExpensesValue + annualInvestmentsValueAdjusted;
    const annualBalanceValue = amount(
      annualDepositCents - annualInvestedCents - (annualPaidExpenseCents - annualPaidInvestmentWithdrawals) - annualFixedPaidCents,
    );
  
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
      totalValues: {
        totalExpenses,
        realizedExpenses: totalExpenses,
        forecastExpenses,
        paidFixedCosts: amount(paidFixedCents),
        pendingFixedCosts: amount(pendingFixedCents),
        totalInvestments,
        investedPosition: totalInvestments,
        totalDeposits,
        balance,
        projectedBalance: amount(projectedBalanceCents),
      },
      percentsValues: { expensePercentage, investmentPercentage, depositPercentage },
      topCategories,
      lastTransactions,
      anualBalance,
    };
  };  
};
