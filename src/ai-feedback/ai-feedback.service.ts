/* eslint-disable prettier/prettier */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma-services/prisma.service';
import { GeminiService } from './gemini.service';
import { TransationService } from '../transation/transation.service';
import { TransationType } from '@prisma/client';
import { AIFeedbackResponseDto } from './dto/ai-feedback-response.dto';

@Injectable()
export class AIFeedbackService {
  private readonly logger = new Logger(AIFeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly transationService: TransationService,
  ) {}

  async generateFeedback(
    userId: string, 
    competence: string, 
    forceRegenerate: boolean = false
  ): Promise<AIFeedbackResponseDto> {
    this.logger.log(`Generating feedback for user ${userId}, competence ${competence} (force: ${forceRegenerate})`);

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
        this.logger.log(`Using cached feedback for ${userId}/${competence}`);
        return this.mapToDto(existingFeedback);
      }
    } else {
      this.logger.log(`Force regenerating feedback for ${userId}/${competence}`);
    }

    // Get transactions for the month
    const transactions = await this.getMonthlyTransactions(userId, competence);

    if (transactions.length === 0) {
      throw new NotFoundException('Não há transações para o período selecionado');
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(transactions);

    if (metrics.totalIncome === 0) {
      throw new NotFoundException('Não há entradas (DEPOSIT) registradas para o período selecionado');
    }

    // Build prompt for Gemini
    const prompt = this.buildAnalysisPrompt(metrics, competence);

    // Call Gemini API
    const analysis = await this.geminiService.generateFinancialAnalysis(prompt);
    const modelName = this.geminiService.getModelName();

    // Delete existing feedback if any
    await this.prisma.aIFeedback.deleteMany({
      where: { userId, competence },
    });

    // Save feedback to database
    const feedback = await this.prisma.aIFeedback.create({
      data: {
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
    });

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

  private async getMonthlyTransactions(userId: string, competence: string) {
    try {
      const dashboardData = await this.transationService['findAllTransactionsByUserIdAndMonth'](
        userId,
        competence,
      );
      return dashboardData;
    } catch (error) {
      this.logger.error(`Error fetching transactions: ${error.message}`);
      return [];
    }
  }

  private calculateMetrics(transactions: any[]) {
    let totalIncome = 0;
    let totalExpense = 0;
    let totalInvestment = 0;
    const categoryExpenses: Record<string, number> = {};

    for (const transaction of transactions) {
      const amount = Number(transaction.amount);

      if (transaction.type === TransationType.DEPOSIT) {
        totalIncome += amount;
      } else if (transaction.type === TransationType.EXPENSE) {
        totalExpense += amount;
        
        const category = transaction.category || 'OTHER';
        categoryExpenses[category] = (categoryExpenses[category] || 0) + amount;
      } else if (transaction.type === TransationType.INVESTMENT) {
        totalInvestment += amount;
      }
    }

    // Find top expense category
    let topCategory: string | null = null;
    let topCategoryValue: number | null = null;

    for (const [category, value] of Object.entries(categoryExpenses)) {
      if (topCategoryValue === null || value > topCategoryValue) {
        topCategory = category;
        topCategoryValue = value;
      }
    }

    return {
      totalIncome,
      totalExpense,
      totalInvestment,
      topCategory,
      topCategoryValue,
    };
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
