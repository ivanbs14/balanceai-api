/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TransationController } from './transation.controller';
import { TransationService } from './transation.service';
import { PrismaModule } from '../prisma-services/prisma.module';
import { FixedCostModule } from '../fixed-cost/fixed-cost.module';

@Module({
  imports: [PrismaModule, FixedCostModule, AuthModule],
  controllers: [TransationController],
  providers: [TransationService],
})
export class TransationModule {}
