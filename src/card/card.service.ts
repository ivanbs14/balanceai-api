import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma-services/prisma.service";
import { parseCivilDate, utcMonthBounds } from "../common/civil-date";
import { CreateCardDto } from "./dto/create-card.dto";
import { UpdateCardDto } from "./dto/update-card.dto";

@Injectable()
export class CardService {
  constructor(private readonly prisma: PrismaService) {}

  private validateId(id: string) {
    if (!id?.trim()) throw new BadRequestException("ID do cartão inválido.");
  }

  private async requireOwned(id: string, userId: string) {
    this.validateId(id);
    const card = await this.prisma.card.findFirst({ where: { id, userId } });
    if (!card) throw new NotFoundException("Cartão não encontrado.");
    return card;
  }

  private rethrowMissing(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new NotFoundException("Cartão não encontrado.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new ConflictException("Cartão possui transações associadas.");
    }
    throw error;
  }

  create(data: CreateCardDto, userId: string) {
    return this.prisma.card.create({
      data: {
        name: data.name,
        invoiceDate: parseCivilDate(data.invoiceDate),
        invoicePayment: parseCivilDate(data.invoicePayment),
        limitBalance: data.limitBalance,
        userId,
      },
    });
  }

  findAll(userId: string) {
    return this.prisma.card.findMany({ where: { userId } });
  }

  findAllByUserId(userId: string) {
    return this.prisma.card.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findOne(id: string, userId: string) {
    return this.requireOwned(id, userId);
  }

  async findCardTransations(cardId: string, userId: string) {
    await this.requireOwned(cardId, userId);
    return this.prisma.transation.findMany({
      where: { cardId, userId },
      orderBy: { Date: "desc" },
    });
  }

  async findTransationsByCard(
    cardId: string,
    userId: string,
    date?: string,
    page = 1,
    pageSize = 10,
  ) {
    await this.requireOwned(cardId, userId);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      (page - 1) * pageSize > 2147483647
    ) {
      throw new BadRequestException("Paginação inválida.");
    }
    const where: Prisma.TransationWhereInput = { cardId, userId };
    if (date) {
      if (
        !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date) ||
        Number.isNaN(parseCivilDate(date).getTime())
      ) {
        throw new BadRequestException("Data inválida. Use YYYY-MM-DD.");
      }
      const { start: startDate, end: endDate } = utcMonthBounds(date.slice(0, 7));
      where.Date = { gte: startDate, lt: endDate };
    }
    const transactions = await this.prisma.transation.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ Date: "desc" }, { id: "desc" }],
    });
    const totalRecords = await this.prisma.transation.count({ where });
    return {
      transactions,
      totalPages: Math.ceil(totalRecords / pageSize),
      currentPage: page,
      pageSize,
    };
  }

  async update(id: string, userId: string, data: UpdateCardDto) {
    await this.requireOwned(id, userId);
    try {
      return await this.prisma.card.update({
        where: { id, userId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.invoiceDate !== undefined
            ? { invoiceDate: parseCivilDate(data.invoiceDate) }
            : {}),
          ...(data.invoicePayment !== undefined
            ? { invoicePayment: parseCivilDate(data.invoicePayment) }
            : {}),
          ...(data.limitBalance !== undefined
            ? { limitBalance: data.limitBalance }
            : {}),
        },
      });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }

  async remove(id: string, userId: string) {
    await this.requireOwned(id, userId);
    if (await this.prisma.transation.count({ where: { cardId: id } })) {
      throw new ConflictException("Cartão possui transações associadas.");
    }
    try {
      return await this.prisma.card.delete({ where: { id, userId } });
    } catch (error) {
      this.rethrowMissing(error);
    }
  }
}
