/* eslint-disable prettier/prettier */
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { TransationService } from './transation.service';
import { TransationPaymentStatus } from '@prisma/client';
import { CreateTransationDto } from './dto/create-transation.dto';
import { UpdateTransationPaymentStatusDto } from './dto/update-transation-payment-status.dto';
import { UpdateInstallmentGroupDto } from './dto/update-installment-group.dto';
import { UpdateTransationDto } from './dto/update-transation.dto';
import { CookieAuthGuard } from '../auth/cookie-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPayload } from '../auth/auth.types';

@Controller('transations')
@UseGuards(CookieAuthGuard)
export class TransationController {
  constructor(private readonly transationService: TransationService) {}

  private assertLegacyUser(userId: string, user: AuthPayload) {
    if (userId !== user.userId) throw new ForbiddenException('Usuário da rota difere da sessão.');
  }

  private parsePage(value: string | undefined, fallback: number, max: number) {
    if (value === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(value)) throw new BadRequestException('Paginação inválida.');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > max) throw new BadRequestException('Paginação inválida.');
    return parsed;
  }

  @Post()
  async create(
    @Body() data: CreateTransationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    if (data.userId !== undefined && data.userId !== user.userId) {
      throw new ForbiddenException('Usuário do payload difere da sessão.');
    }
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
    @Param('userId') legacyUserId: string,
    @Param('date') date: string,
    @CurrentUser() user: AuthPayload,
  ) {
    this.assertLegacyUser(legacyUserId, user);
    return this.transationService.getAllBalance(user.userId, date);
  }

  @Get('user/:userId/:month')
  async findByUserIdAndMonth(
    @Param('userId') legacyUserId: string,
    @Param('month') month: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('paymentStatus') paymentStatus?: TransationPaymentStatus,
    @CurrentUser() user?: AuthPayload,
  ) {
    this.assertLegacyUser(legacyUserId, user!);
    return this.transationService.findByUserIdAndMonth(
      user!.userId,
      month,
      this.parsePage(page, 1, 21474836),
      this.parsePage(pageSize, 10, 100),
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
    @Param('userId') legacyUserId: string,
    @Param('date') date: string,
    @CurrentUser() user: AuthPayload,
  ) {
    this.assertLegacyUser(legacyUserId, user);
    return this.transationService.getTopCreditCardsByMonth(user.userId, date);
  }

  @Get('dashboard/:userId/:month')
  async getDashboardMonthlyData(
    @Param('userId') legacyUserId: string,
    @Param('month') month: string,
    @CurrentUser() user: AuthPayload,
  ) {
    this.assertLegacyUser(legacyUserId, user);
    return this.transationService.getDashboardMonthlyData(user.userId, month);
  }

  @Get('card-names/:userId')
  async getUniqueCreditCardNames(@Param('userId') legacyUserId: string, @CurrentUser() user: AuthPayload): Promise<string[]> {
    this.assertLegacyUser(legacyUserId, user);
    return this.transationService.getUniqueCreditCardNames(user.userId);
  }

  @Get('find-card/:nameCard')
  async findByNameCard(
    @Param('nameCard') nameCard: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.transationService.findByNameCard(user.userId, nameCard);
  }

  @Get('open-by-card/:nameCard')
  async findTransactionsByCard(
    @Param('nameCard') nameCard: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.transationService.findTransactionsByCard(user.userId, nameCard);
  }

  @Get(':id/installment-group')
  async getInstallmentGroupSummary(
    @Param('id') id: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.transationService.getInstallmentGroupSummary(id, user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthPayload) {
    return this.transationService.findOne(id, user.userId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: UpdateTransationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.transationService.update(id, user.userId, data);
  }

  @Patch(':id/installment-group')
  async updateInstallmentGroup(
    @Param('id') id: string,
    @Body() data: UpdateInstallmentGroupDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.transationService.updateInstallmentGroup(id, user.userId, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthPayload) {
    return this.transationService.delete(id, user.userId);
  }
}
