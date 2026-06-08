/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { PrismaService } from 'src/prisma-services/prisma.service';

@Injectable()
export class CardService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCardDto: CreateCardDto) {
    return this.prisma.card.create({
      data: {
        ...createCardDto,
        invoiceDate: new Date(createCardDto.invoiceDate),
        invoicePayment: new Date(createCardDto.invoicePayment),
      },
    });
  }

  async findAll() {
    return this.prisma.card.findMany();
  }

  async findAllByUserId(userId: string) {
    const cards = await this.prisma.card.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  
    return cards;
  }

  async findOne(id: string) {
    return this.prisma.card.findUnique({
      where: { id },
    });
  }

  async findCardTransations(cardId: string) {
    return this.prisma.transation.findMany({
      where: {
        cardId: cardId,
      },
      orderBy: {
        Date: 'desc',
      },
    });
  };

  async findTransationsByCard(
  cardId: string,
  date?: string,
  page: number = 1,
  pageSize: number = 10,
) {
  if (!cardId) {
    throw new Error('cardId is required');
  }

  const whereClause: any = {
    cardId,
  };

  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid date format. Expected format: YYYY-MM-DD');
    }

    const [year, month] = date.split('-');
    const targetMonth = parseInt(month, 10) - 1;

    const startDate = new Date(Number(year), targetMonth, 1);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    whereClause.Date = {
      gte: startDate,
      lt: endDate,
    };
  }

  const skip = (page - 1) * pageSize;

  const transactions = await this.prisma.transation.findMany({
    where: whereClause,
    skip,
    take: pageSize,
    orderBy: {
      Date: 'desc',
    },
  });

  const totalRecords = await this.prisma.transation.count({
    where: whereClause,
  });

  const totalPages = Math.ceil(totalRecords / pageSize);

  return {
    transactions,
    totalPages,
    currentPage: page,
    pageSize,
  };
}




  async update(id: string, updateCardDto: UpdateCardDto) {
    return this.prisma.card.update({
      where: { id },
      data: {
        ...updateCardDto,
        ...(updateCardDto.invoiceDate
          ? { invoiceDate: new Date(updateCardDto.invoiceDate) }
          : {}),
        ...(updateCardDto.invoicePayment
          ? { invoicePayment: new Date(updateCardDto.invoicePayment) }
          : {}),
      },
    });
  }

  async remove(id: string) {
    return this.prisma.card.delete({
      where: { id },
    });
  }
}
