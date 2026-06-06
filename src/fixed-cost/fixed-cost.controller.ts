/* eslint-disable prettier/prettier */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateFixedCostDto } from './dto/create-fixed-cost.dto';
import { UpdateFixedCostDto } from './dto/update-fixed-cost.dto';
import { UpdateFixedCostMonthlyDto } from './dto/update-fixed-cost-monthly.dto';
import { FixedCostService } from './fixed-cost.service';

@Controller('fixed-costs')
export class FixedCostController {
  constructor(private readonly fixedCostService: FixedCostService) {}

  @Post()
  create(@Body() data: CreateFixedCostDto) {
    return this.fixedCostService.create(data);
  }

  @Get()
  findAll(@Query('userId') userId?: string, @Query('month') month?: string) {
    if (userId && month) {
      return this.fixedCostService.findByUserIdAndMonth(userId, month);
    }

    if (userId) {
      return this.fixedCostService.findByUserId(userId);
    }

    return this.fixedCostService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.fixedCostService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: UpdateFixedCostDto) {
    return this.fixedCostService.update(id, data);
  }

  @Patch(':id/monthly/:competence')
  updateMonthly(
    @Param('id') id: string,
    @Param('competence') competence: string,
    @Body() data: UpdateFixedCostMonthlyDto,
  ) {
    return this.fixedCostService.updateMonthly(id, competence, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.fixedCostService.remove(id);
  }
}