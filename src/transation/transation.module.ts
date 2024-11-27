/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { TransationController } from './transation.controller';
import { TransationService } from './transation.service';
import { PrismaModule } from 'src/prisma-services/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TransationController],
  providers: [TransationService],
})
export class TransationModule {}
