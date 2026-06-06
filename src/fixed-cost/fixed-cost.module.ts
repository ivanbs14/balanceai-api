/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma-services/prisma.module';
import { FixedCostController } from './fixed-cost.controller';
import { FixedCostService } from './fixed-cost.service';

@Module({
  imports: [PrismaModule],
  controllers: [FixedCostController],
  providers: [FixedCostService],
})
export class FixedCostModule {}