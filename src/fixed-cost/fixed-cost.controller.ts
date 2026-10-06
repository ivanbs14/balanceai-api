/* eslint-disable prettier/prettier */
import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthPayload } from '../auth/auth.types';
import { CookieAuthGuard } from '../auth/cookie-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateFixedCostDto } from './dto/create-fixed-cost.dto';
import { UpdateFixedCostDto } from './dto/update-fixed-cost.dto';
import { UpdateFixedCostMonthlyDto } from './dto/update-fixed-cost-monthly.dto';
import { LinkFixedCostMonthlyDto } from './dto/link-fixed-cost-monthly.dto';
import { FixedCostService } from './fixed-cost.service';

@Controller('fixed-costs')
@UseGuards(CookieAuthGuard)
export class FixedCostController {
  constructor(private readonly fixedCostService: FixedCostService) {}

  @Post()
  create(@Body() data: CreateFixedCostDto, @CurrentUser() user: AuthPayload) {
    if (data.userId !== undefined && data.userId !== user.userId) throw new ForbiddenException();
    return this.fixedCostService.create(data, user.userId);
  }

  @Get()
  findAll(@CurrentUser() user: AuthPayload, @Query('userId') userId?: string, @Query('month') month?: string) {
    if (userId !== undefined && userId !== user.userId) throw new ForbiddenException();
    if (month !== undefined) return this.fixedCostService.findByUserIdAndMonth(user.userId, month);
    return this.fixedCostService.findAll(user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthPayload) {
    return this.fixedCostService.findOne(id, user.userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: UpdateFixedCostDto, @CurrentUser() user: AuthPayload) {
    if (data.userId !== undefined && data.userId !== user.userId) throw new ForbiddenException();
    return this.fixedCostService.update(id, user.userId, data);
  }

  @Patch(':id/monthly/:competence')
  updateMonthly(
    @Param('id') id: string,
    @Param('competence') competence: string,
    @Body() data: UpdateFixedCostMonthlyDto,
    @CurrentUser() user: AuthPayload,
  ) {
    if (data.userId !== undefined && data.userId !== user.userId) throw new ForbiddenException();
    return this.fixedCostService.updateMonthly(id, user.userId, competence, data);
  }

  @Post(':id/monthly/:competence/link')
  linkMonthly(
    @Param('id') id: string,
    @Param('competence') competence: string,
    @Body() data: LinkFixedCostMonthlyDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.fixedCostService.linkMonthly(id, user.userId, competence, data.transactionId);
  }

  @Delete(':id/monthly/:competence/link')
  unlinkMonthly(
    @Param('id') id: string,
    @Param('competence') competence: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.fixedCostService.unlinkMonthly(id, user.userId, competence);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthPayload) {
    return this.fixedCostService.remove(id, user.userId);
  }
}
