/* eslint-disable prettier/prettier */
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { TransationService } from './transation.service';
import { Prisma, TransationPaymentStatus } from '@prisma/client';
import { CreateTransationDto } from './dto/create-transation.dto';
import { UpdateTransationPaymentStatusDto } from './dto/update-transation-payment-status.dto';
import { CookieAuthGuard } from 'src/auth/cookie-auth.guard';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { AuthPayload } from 'src/auth/auth.types';

@Controller('transations')
@UseGuards(CookieAuthGuard)
export class TransationController {
  constructor(private readonly transationService: TransationService) {}

  @Post()
  async create(
    @Body() data: CreateTransationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.transationService.create({
      ...data,
      userId: user.userId,
    });
  }

  @Get()
  async findAll(@CurrentUser() user: AuthPayload) {
    return this.transationService.findAllByUserId(user.userId);
  }

  @Get('previous-date/:userId/:date')
  async getAllBalanceDate(
    @Param('date') date: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.transationService.getAllBalance(user.userId, date);
  }

  @Get('user/:userId/:month')
  async findByUserIdAndMonth(
    @Param('month') month: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('paymentStatus') paymentStatus?: TransationPaymentStatus,
    @CurrentUser() user?: AuthPayload,
  ) {
    return this.transationService.findByUserIdAndMonth(
      user!.userId,
      month,
      Number(page),
      Number(pageSize),
      paymentStatus,
    );
  };

  @Patch(':id/payment-status')
  async updatePaymentStatus(
    @Param('id') id: string,
    @Body() data: UpdateTransationPaymentStatusDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.transationService.updatePaymentStatus(id, user.userId, data);
  }
  
  @Get('card/:userId/:date')
  async getTopCreditCardsByMonth(
    @Param('date') date: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.transationService.getTopCreditCardsByMonth(user.userId, date);
  }

  @Get('dashboard/:userId/:month')
  async getDashboardMonthlyData(
    @Param('month') month: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.transationService.getDashboardMonthlyData(user.userId, month);
  }

  @Get('card-names/:userId')
  async getUniqueCreditCardNames(@CurrentUser() user: AuthPayload): Promise<string[]> {
    return this.transationService.getUniqueCreditCardNames(user.userId);
  }

  @Get('find-card/:nameCard')
  async findByNameCard(
    @Param('nameCard') nameCard: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.transationService.findByNameCard(user.userId, nameCard);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthPayload) {
    return this.transationService.findOne(id, user.userId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: Prisma.TransationUpdateInput,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.transationService.update(id, user.userId, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthPayload) {
    return this.transationService.delete(id, user.userId);
  }
}
