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
