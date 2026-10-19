/* eslint-disable prettier/prettier */
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';
import { FixedCostRecurrence, TransationCategory, TransationPaymentMethod } from '@prisma/client';
import { POSITIVE_MONEY_PATTERN } from '../../common/money';

export class UpdateFixedCostDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsNotEmpty()
  @IsString()
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(POSITIVE_MONEY_PATTERN)
  defaultAmount?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(TransationCategory, { message: 'A categoria informada é inválida.' })
  category?: TransationCategory;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(TransationPaymentMethod, { message: 'O método de pagamento informado é inválido.' })
  paymentMethod?: TransationPaymentMethod;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(FixedCostRecurrence, { message: 'A recorrência informada é inválida.' })
  recurrence?: FixedCostRecurrence;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  startDate?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  endDate?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt({ message: 'O dia de vencimento deve ser um número inteiro.' })
  @Min(1, { message: 'O dia de vencimento mínimo é 1.' })
  @Max(31, { message: 'O dia de vencimento máximo é 31.' })
  dueDay?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  confirmEndDateChange?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  userId?: string;
}
