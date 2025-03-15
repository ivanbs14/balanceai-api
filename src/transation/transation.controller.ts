/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { TransationService } from './transation.service';
import { Prisma } from '@prisma/client';
import { CreateTransationDto } from './dto/create-transation.dto';

@Controller('transations')
export class TransationController {
  constructor(private readonly transationService: TransationService) {}

  @Post()
  async create(@Body() data: CreateTransationDto) {
    return this.transationService.create(data);
  }

  @Get()
  async findAll() {
    return this.transationService.findAll();
  }

  @Get('expenses/previous-month/:userId/:month')
  async getTotalExpensesForPreviousMonth(@Param('userId') userId: string, @Param('month') month: string) {
    return this.transationService.getTotalExpensesAndInvestmentsForPreviousMonth(userId, month);
  }

  @Get('previous-date/:userId/:date')
  async getAllBalanceDate(@Param('userId') userId: string, @Param('date') date: string) {
    return this.transationService.getAllBalance(userId, date);
  }

  @Get('user/:userId/:month')
  async findByUserIdAndMonth(@Param('userId') userId: string, @Param('month') month: string) {
    return this.transationService.findByUserIdAndMonth(userId, month);
  }
  
  @Get('card/:userId/:date')
  async getTopCreditCardsByMonth(@Param('userId') userId: string, @Param('date') date: string) {
    return this.transationService.getTopCreditCardsByMonth(userId, date);
  }
  
  @Get('year/:userId/:year')
  async getTotalExpensesAndInvestmentsForYear(@Param('userId') userId: string, @Param('year') month: string) {
    return this.transationService.getTotalExpensesAndInvestmentsForYear(userId, month);
  }

  @Get('card-names/:userId')
  async getUniqueCreditCardNames(@Param('userId') userId: string): Promise<string[]> {
    return this.transationService.getUniqueCreditCardNames(userId);
  }

  @Get('find-card/:nameCard')
  async findByNameCard(@Param('nameCard') nameCard: string) {
    return this.transationService.findByNameCard(nameCard);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.transationService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: Prisma.TransationUpdateInput) {
    return this.transationService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.transationService.delete(id);
  }
}
