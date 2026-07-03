/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AIFeedbackController } from './ai-feedback.controller';
import { AIFeedbackService } from './ai-feedback.service';
import { GeminiService } from './gemini.service';
import { PrismaModule } from '../prisma-services/prisma.module';
import { TransationModule } from '../transation/transation.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, TransationModule, AuthModule],
  controllers: [AIFeedbackController],
  providers: [AIFeedbackService, GeminiService],
  exports: [AIFeedbackService],
})
export class AIFeedbackModule {}
