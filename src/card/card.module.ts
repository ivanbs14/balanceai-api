/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma-services/prisma.module';
import { CardService } from './card.service';
import { CardController } from './cards.controller';
import { SessionModule } from '../auth/session.module';
/* import { PrismaService } from 'src/prisma-services/prisma.service'; */

@Module({
  imports: [PrismaModule, SessionModule],
  controllers: [CardController],
  providers: [CardService],
})
export class CardModule {}
