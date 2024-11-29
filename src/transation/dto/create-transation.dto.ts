/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsEnum, IsDecimal, IsDateString } from 'class-validator';
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

  @IsDateString()
  Date: string;
}
