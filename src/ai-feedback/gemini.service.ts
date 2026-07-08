/* eslint-disable prettier/prettier */
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
  }

  private isRateLimitError(error: any): boolean {
    const errorMessage = error?.message || '';
    return errorMessage.includes('429') || 
           errorMessage.includes('Too Many Requests') || 
           errorMessage.includes('quota') ||
           errorMessage.includes('rate limit');
  }

  private extractRetryDelay(error: any): number | null {
    const errorMessage = error?.message || '';
    const retryMatch = errorMessage.match(/retry in (\d+(?:\.\d+)?)s/i);
    if (retryMatch) {
      return Math.ceil(parseFloat(retryMatch[1]) * 1000);
    }
    return null;
  }

  async generateFinancialAnalysis(prompt: string): Promise<string> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`Calling Gemini API (attempt ${attempt + 1}/${maxRetries + 1})`);
        
        const model = this.genAI.getGenerativeModel({ model: this.model });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        this.logger.log('Successfully received response from Gemini API');
        return text;
      } catch (error) {
        lastError = error as Error;
        
        // Detectar erro de rate limit
        if (this.isRateLimitError(error)) {
          const retryDelay = this.extractRetryDelay(error);
          
          this.logger.error(
            `Gemini API rate limit exceeded (attempt ${attempt + 1}/${maxRetries + 1}). ` +
            `Quota exhausted. ${retryDelay ? `Suggested retry: ${retryDelay/1000}s` : ''}`
          );
          
          // Se é rate limit, não adianta tentar novamente imediatamente
          if (attempt === 0) {
            throw new HttpException(
              {
                statusCode: HttpStatus.SERVICE_UNAVAILABLE,
                message: 'AI service temporarily unavailable due to quota limits. Please try again later.',
                error: 'Service Unavailable',
                details: 'Gemini API quota exceeded',
                retryAfter: retryDelay ? Math.ceil(retryDelay / 1000) : 30
              },
              HttpStatus.SERVICE_UNAVAILABLE
            );
          }
        } else {
          this.logger.warn(`Gemini API call failed (attempt ${attempt + 1}): ${lastError.message}`);
        }
        
        if (attempt < maxRetries && !this.isRateLimitError(error)) {
          // Exponential backoff apenas para erros não-rate-limit
          const waitTime = Math.pow(2, attempt) * 1000;
          this.logger.log(`Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    const errorMessage = `Failed to generate analysis after ${maxRetries + 1} attempts: ${lastError?.message}`;
    
    if (this.isRateLimitError(lastError)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'AI service quota exceeded. Please try again later.',
          error: 'Service Unavailable',
          details: errorMessage
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    throw new Error(errorMessage);
  }

  getModelName(): string {
    return this.model;
  }
}
