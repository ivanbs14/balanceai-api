/* eslint-disable prettier/prettier */
import { IsString, IsDateString, IsDecimal, IsOptional } from 'class-validator';

export class UpdateCardDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsDateString({}, { message: 'A data de fechamento da fatura deve ser uma data válida.' })
  @IsOptional()
  invoiceDate?: string;

  @IsDecimal({ decimal_digits: '2', force_decimal: true }, { message: 'O limite do cartão deve ser um número decimal com 2 casas decimais.' })
  @IsOptional()
  limitBalance?: string;

  @IsDateString({}, { message: 'A data de fechamento da fatura deve ser uma data válida.' })
  @IsOptional()
  invoicePayment?: string;

  @IsString({ message: 'O ID do usuário deve ser uma string válida.' })
  @IsOptional()
  userId?: string;
}
