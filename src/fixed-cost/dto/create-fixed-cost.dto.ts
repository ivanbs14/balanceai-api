/* eslint-disable prettier/prettier */
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';
import { FixedCostRecurrence, TransationCategory, TransationPaymentMethod } from '@prisma/client';
import { POSITIVE_MONEY_PATTERN } from '../../common/money';

export class CreateFixedCostDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do custo fixo é obrigatório.' })
  name: string;

  @Matches(POSITIVE_MONEY_PATTERN)
  defaultAmount: string;

  @IsEnum(TransationCategory, { message: 'A categoria informada é inválida.' })
  category: TransationCategory;

  @IsEnum(TransationPaymentMethod, { message: 'O método de pagamento informado é inválido.' })
  paymentMethod: TransationPaymentMethod;

  @IsEnum(FixedCostRecurrence, { message: 'A recorrência informada é inválida.' })
  recurrence: FixedCostRecurrence;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  startDate: string;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  endDate?: string | null;

  @IsInt({ message: 'O dia de vencimento deve ser um número inteiro.' })
  @Min(1, { message: 'O dia de vencimento mínimo é 1.' })
  @Max(31, { message: 'O dia de vencimento máximo é 31.' })
  dueDay: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  userId?: string;
}
