/* eslint-disable prettier/prettier */
import { TransationPaymentStatus } from '@prisma/client';
import { IsDateString, IsEnum, Matches, ValidateIf } from 'class-validator';

export class UpdateTransationPaymentStatusDto {
  @IsEnum(TransationPaymentStatus, { message: 'O status de pagamento informado é inválido.' })
  paymentStatus: TransationPaymentStatus;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
  @IsDateString()
  paidAt?: string;
}
