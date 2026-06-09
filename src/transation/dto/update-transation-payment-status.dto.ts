/* eslint-disable prettier/prettier */
import { TransationPaymentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class UpdateTransationPaymentStatusDto {
  @IsEnum(TransationPaymentStatus, { message: 'O status de pagamento informado é inválido.' })
  paymentStatus: TransationPaymentStatus;

  @IsOptional()
  @IsDateString({}, { message: 'A data de pagamento deve ser uma data válida.' })
  paidAt?: string;
}
