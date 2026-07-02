/* eslint-disable prettier/prettier */
import { IsDecimal, IsOptional, IsString } from 'class-validator';

export class UpdateTransationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDecimal(
    { decimal_digits: '2', force_decimal: true },
    { message: 'O valor deve ser um número decimal com 2 casas decimais.' },
  )
  amount?: string;
}
