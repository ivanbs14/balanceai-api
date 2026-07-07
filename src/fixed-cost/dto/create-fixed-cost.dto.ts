/* eslint-disable prettier/prettier */
import { IsBoolean, IsDateString, IsDecimal, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { FixedCostRecurrence, TransationCategory, TransationPaymentMethod } from '@prisma/client';

export class CreateFixedCostDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do custo fixo é obrigatório.' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'O userId é obrigatório.' })
  userId: string;

  @IsDecimal({ decimal_digits: '2', force_decimal: true }, { message: 'O valor padrão deve ser um número decimal com 2 casas decimais.' })
  defaultAmount: string;

  @IsEnum(TransationCategory, { message: 'A categoria informada é inválida.' })
  category: TransationCategory;

  @IsEnum(TransationPaymentMethod, { message: 'O método de pagamento informado é inválido.' })
  paymentMethod: TransationPaymentMethod;

  @IsEnum(FixedCostRecurrence, { message: 'A recorrência informada é inválida.' })
  recurrence: FixedCostRecurrence;

  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  startDate: string;

  @IsInt({ message: 'O dia de vencimento deve ser um número inteiro.' })
  @Min(1, { message: 'O dia de vencimento mínimo é 1.' })
  @Max(31, { message: 'O dia de vencimento máximo é 31.' })
  dueDay: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
