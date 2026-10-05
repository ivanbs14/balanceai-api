/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma-services/prisma.service';
import { GeminiService } from './gemini.service';
import { TransationService } from '../transation/transation.service';
import { AIFeedbackResponseDto } from './dto/ai-feedback-response.dto';

@Injectable()
export class AIFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly transationService: TransationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AIFeedbackService.name);
  }

  async generateFeedback(
    userId: string, 
    competence: string, 
    forceRegenerate: boolean = false
  ): Promise<AIFeedbackResponseDto> {
    this.logger.info({ event: 'feedback_generation_started', forceRegenerate });

    // Check if feedback already exists (cache) - skip if force regenerate
    if (!forceRegenerate) {
      const existingFeedback = await this.prisma.aIFeedback.findUnique({
        where: {
          userId_competence: {
            userId,
            competence,
          },
        },
      });

      if (existingFeedback) {
        this.logger.info({ event: 'feedback_cache_hit' });
        return this.mapToDto(existingFeedback);
      }
    } else {
      this.logger.info({ event: 'feedback_cache_bypassed' });
    }

    this.geminiService.ensureConfigured();

    let summary: Awaited<ReturnType<TransationService['getAllBalance']>>;
    try {
      summary = await this.transationService.getAllBalance(userId, competence);
    } catch {
      this.logger.error({ event: 'feedback_summary_read_failed', errorCode: 'DATABASE_READ_FAILED' });
      throw new ServiceUnavailableException('Não foi possível consultar os dados financeiros.');
    }
    const topCategory = summary.topCategories[0];
    const metrics = {
      totalIncome: Number(summary.totalValues.totalDeposits),
      totalExpense: Number(summary.totalValues.realizedExpenses),
      totalInvestment: Number(summary.totalValues.investedPosition),
      topCategory: topCategory?.category ?? null,
      topCategoryValue: topCategory?.value ?? null,
    };

    if (metrics.totalIncome === 0 && metrics.totalExpense === 0 && metrics.totalInvestment === 0) {
      this.logger.warn({ event: 'feedback_generation_failed', errorCode: 'NO_TRANSACTIONS' });
      throw new NotFoundException('Não há lançamentos realizados para o período selecionado');
    }

    if (metrics.totalIncome === 0) {
      this.logger.warn({ event: 'feedback_generation_failed', errorCode: 'NO_INCOME' });
      throw new NotFoundException('Não há entradas (DEPOSIT) registradas para o período selecionado');
    }

    // Build prompt for Gemini
    const prompt = this.buildAnalysisPrompt(metrics, competence);

    // Call Gemini API
    const analysis = await this.geminiService.generateFinancialAnalysis(prompt);
    const modelName = this.geminiService.getModelName();

    // Replace only after successful generation, in one database mutation.
    const feedback = await this.prisma.aIFeedback.upsert({
      where: { userId_competence: { userId, competence } },
      create: {
        userId,
        competence,
        totalIncome: metrics.totalIncome,
        totalExpense: metrics.totalExpense,
        totalInvestment: metrics.totalInvestment,
        topCategory: metrics.topCategory,
        topCategoryValue: metrics.topCategoryValue,
        analysis,
        model: modelName,
      },
      update: {
        totalIncome: metrics.totalIncome,
        totalExpense: metrics.totalExpense,
        totalInvestment: metrics.totalInvestment,
        topCategory: metrics.topCategory,
        topCategoryValue: metrics.topCategoryValue,
        analysis,
        model: modelName,
      },
    });

    this.logger.info({ event: 'feedback_generation_succeeded' });
    return this.mapToDto(feedback);
  }

  async getFeedback(userId: string, competence: string): Promise<AIFeedbackResponseDto | null> {
    const feedback = await this.prisma.aIFeedback.findUnique({
      where: {
        userId_competence: {
          userId,
          competence,
        },
      },
    });

    if (!feedback) {
      return null;
    }

    return this.mapToDto(feedback);
  }

  private buildAnalysisPrompt(metrics: any, competence: string): string {
    const expensePercentage = (metrics.totalIncome > 0)
      ? ((metrics.totalExpense / metrics.totalIncome) * 100).toFixed(2)
      : '0.00';
    
    const investmentPercentage = (metrics.totalIncome > 0)
      ? ((metrics.totalInvestment / metrics.totalIncome) * 100).toFixed(2)
      : '0.00';

    const categoryMap: Record<string, string> = {
      HOUSING: 'Moradia',
      TRANSPORTION: 'Transporte',
      FOOD: 'Alimentação',
      ENTERTAINMENT: 'Entretenimento',
      HEALTH: 'Saúde',
      UTILITY: 'Utilidades',
      SALARY: 'Salário',
      EDUCATION: 'Educação',
      OTHER: 'Outros',
    };

    const topCategoryName = metrics.topCategory
      ? categoryMap[metrics.topCategory] || metrics.topCategory
      : 'Nenhuma';

    return `
Você é um assistente financeiro inteligente. Analise os dados financeiros abaixo e forneça insights claros, objetivos e acionáveis em português brasileiro.

**Dados do período ${competence}:**
- Total de Entradas (DEPOSIT): R$ ${metrics.totalIncome.toFixed(2)}
- Total de Despesas (EXPENSE): R$ ${metrics.totalExpense.toFixed(2)} (${expensePercentage}% das entradas)
- Total de Investimentos (INVESTMENT): R$ ${metrics.totalInvestment.toFixed(2)} (${investmentPercentage}% das entradas)
- Categoria com maior gasto: ${topCategoryName} - R$ ${(metrics.topCategoryValue || 0).toFixed(2)}

**Instruções:**
1. Avalie a saúde financeira do usuário destacando as porcentagens de gastos e investimentos em relação às entradas.
2. Comente sobre a categoria de destaque (maior gasto) e se isso é preocupante ou normal.
3. Forneça 2-3 dicas práticas e acionáveis para melhorar a gestão financeira.
4. Use um tom amigável, educativo e motivador.
5. Mantenha a resposta em até 300 palavras.
`.trim();
  }

  private mapToDto(feedback: any): AIFeedbackResponseDto {
    const totalIncome = Number(feedback.totalIncome);
    const totalExpense = Number(feedback.totalExpense);
    const totalInvestment = Number(feedback.totalInvestment);

    const expensePercentage = totalIncome > 0
      ? (totalExpense / totalIncome) * 100
      : 0;

    const investmentPercentage = totalIncome > 0
      ? (totalInvestment / totalIncome) * 100
      : 0;

    return {
      id: feedback.id,
      userId: feedback.userId,
      competence: feedback.competence,
      totalIncome,
      totalExpense,
      totalInvestment,
      expensePercentage,
      investmentPercentage,
      topCategory: feedback.topCategory,
      topCategoryValue: feedback.topCategoryValue ? Number(feedback.topCategoryValue) : null,
      analysis: feedback.analysis,
      model: feedback.model,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
    };
  }
}
