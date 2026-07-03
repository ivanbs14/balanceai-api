/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Param, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { AIFeedbackService } from './ai-feedback.service';
import { CookieAuthGuard } from '../auth/cookie-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPayload } from '../auth/auth.types';

@Controller('ai-feedback')
@UseGuards(CookieAuthGuard)
export class AIFeedbackController {
  constructor(private readonly aiFeedbackService: AIFeedbackService) {}

  @Post('generate/:month')
  @HttpCode(HttpStatus.OK)
  async generateFeedback(
    @Param('month') month: string,
    @CurrentUser() user: AuthPayload,
    @Query('force') force?: string,
  ) {
    const forceRegenerate = force === 'true';
    return this.aiFeedbackService.generateFeedback(user.userId, month, forceRegenerate);
  }

  @Get(':month')
  async getFeedback(
    @Param('month') month: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.aiFeedbackService.getFeedback(user.userId, month);
  }
}
