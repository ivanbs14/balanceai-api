/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { TransationController } from './transation.controller';
import { TransationService } from './transation.service';
import { PrismaModule } from 'src/prisma-services/prisma.module';
import { FixedCostModule } from 'src/fixed-cost/fixed-cost.module';

@Module({
  imports: [PrismaModule, FixedCostModule, AuthModule],
  controllers: [TransationController],
  providers: [TransationService],
})
export class TransationModule {}
