/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { TransationController } from './transation.controller';
import { TransationService } from './transation.service';
import { PrismaModule } from 'src/prisma-services/prisma.module';
import { FixedCostModule } from 'src/fixed-cost/fixed-cost.module';

@Module({
  imports: [PrismaModule, FixedCostModule],
  controllers: [TransationController],
  providers: [TransationService],
})
export class TransationModule {}
