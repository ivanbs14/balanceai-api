/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Param, UseGuards, HttpCode, HttpStatus, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { AIFeedbackService } from './ai-feedback.service';
import { CookieAuthGuard } from '../auth/cookie-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPayload } from '../auth/auth.types';
import { RateLimitService } from '../security/rate-limit.service';

@Controller('ai-feedback')
@UseGuards(CookieAuthGuard)
export class AIFeedbackController {
  constructor(
    private readonly aiFeedbackService: AIFeedbackService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post('generate/:month')
  @HttpCode(HttpStatus.OK)
  async generateFeedback(
    @Param('month') month: string,
    @CurrentUser() user: AuthPayload,
    @Req() request: Request,
    @Query('force') force?: string,
  ) {
    const forceRegenerate = force === 'true';
    this.rateLimit.checkFeedback(
      request.ip || request.socket.remoteAddress || 'unknown',
      user.userId,
      forceRegenerate,
    );
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
