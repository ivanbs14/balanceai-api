/* eslint-disable prettier/prettier */
import { IsDateString, IsDecimal, IsEnum, IsOptional } from 'class-validator';
import { FixedCostMonthlyStatus } from '@prisma/client';

export class UpdateFixedCostMonthlyDto {
  @IsEnum(FixedCostMonthlyStatus, { message: 'O status informado é inválido.' })
  status: FixedCostMonthlyStatus;

  @IsOptional()
  @IsDecimal({ decimal_digits: '2', force_decimal: true }, { message: 'O valor deve ser um número decimal com 2 casas decimais.' })
  amount?: string;

  @IsOptional()
  @IsDateString({}, { message: 'A data de pagamento deve ser uma data válida.' })
  paidAt?: string;
}