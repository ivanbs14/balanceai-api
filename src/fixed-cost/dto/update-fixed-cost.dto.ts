/* eslint-disable prettier/prettier */
import { IsBoolean, IsDateString, IsDecimal, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { FixedCostRecurrence } from '@prisma/client';

export class UpdateFixedCostDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '2', force_decimal: true }, { message: 'O valor padrão deve ser um número decimal com 2 casas decimais.' })
  defaultAmount?: string;

  @IsOptional()
  @IsEnum(FixedCostRecurrence, { message: 'A recorrência informada é inválida.' })
  recurrence?: FixedCostRecurrence;

  @IsOptional()
  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  startDate?: string;

  @IsOptional()
  @IsInt({ message: 'O dia de vencimento deve ser um número inteiro.' })
  @Min(1, { message: 'O dia de vencimento mínimo é 1.' })
  @Max(31, { message: 'O dia de vencimento máximo é 31.' })
  dueDay?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
