/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma-services/prisma.module';
import { CardService } from './card.service';
import { CardController } from './cards.controller';
/* import { PrismaService } from 'src/prisma-services/prisma.service'; */

@Module({
  imports: [PrismaModule],
  controllers: [CardController],
  providers: [CardService],
})
export class CardModule {}