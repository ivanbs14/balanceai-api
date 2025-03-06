/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsEnum, IsDecimal, IsDateString, ValidateIf, IsInt, Min } from 'class-validator';
import { TransationType, TransationCategory, TransationPaymentMethod } from '@prisma/client';

export class CreateTransationDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  userId: string;

  @IsEnum(TransationType)
  type: TransationType;

  @IsDecimal()
  amount: number;

  @IsEnum(TransationCategory)
  category: TransationCategory;

  @IsEnum(TransationPaymentMethod)
  paymentMethod: TransationPaymentMethod;

  @ValidateIf((o) => o.paymentMethod === TransationPaymentMethod.CREDIT_CARD)
  @IsInt({ message: 'A quantidade de parcelas deve ser um número inteiro' })
  @Min(1, { message: 'A quantidade mínima de parcelas é 1' })
  installments?: number;

  @IsDateString()
  nameCard?: string;

  @IsDateString()
  Date: string;
}
