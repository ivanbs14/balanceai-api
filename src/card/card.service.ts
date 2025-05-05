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
      data: createCardDto,
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

  async update(id: string, updateCardDto: UpdateCardDto) {
    return this.prisma.card.update({
      where: { id },
      data: updateCardDto,
    });
  }

  async remove(id: string) {
    return this.prisma.card.delete({
      where: { id },
    });
  }
}
