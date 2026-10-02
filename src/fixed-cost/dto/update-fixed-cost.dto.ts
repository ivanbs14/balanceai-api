/* eslint-disable prettier/prettier */
import { IsBoolean, IsDateString, IsDecimal, IsEnum, IsInt, IsNotEmpty, IsString, Max, Min, ValidateIf } from 'class-validator';
import { FixedCostRecurrence, TransationCategory, TransationPaymentMethod } from '@prisma/client';

export class UpdateFixedCostDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsNotEmpty()
  @IsString()
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsDecimal({ decimal_digits: '2', force_decimal: true }, { message: 'O valor padrão deve ser um número decimal com 2 casas decimais.' })
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
  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  startDate?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt({ message: 'O dia de vencimento deve ser um número inteiro.' })
  @Min(1, { message: 'O dia de vencimento mínimo é 1.' })
  @Max(31, { message: 'O dia de vencimento máximo é 31.' })
  dueDay?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
