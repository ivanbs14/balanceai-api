/* eslint-disable prettier/prettier */
import { IsDateString, IsEnum, IsString, Matches, ValidateIf } from 'class-validator';
import { FixedCostMonthlyStatus } from '@prisma/client';
import { POSITIVE_MONEY_PATTERN } from '../../common/money';

export class UpdateFixedCostMonthlyDto {
  @IsEnum(FixedCostMonthlyStatus, { message: 'O status informado é inválido.' })
  status: FixedCostMonthlyStatus;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(POSITIVE_MONEY_PATTERN)
  amount?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
  @IsDateString()
  paidAt?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  userId?: string;
}
