/* eslint-disable prettier/prettier */
import { IsString, IsDateString, IsDecimal, IsNotEmpty, ValidateIf } from 'class-validator';

export class UpdateCardDto {
  @IsString()
  @ValidateIf((_, value) => value !== undefined)
  @IsNotEmpty()
  name?: string;

  @IsDateString({}, { message: 'A data de fechamento da fatura deve ser uma data válida.' })
  @ValidateIf((_, value) => value !== undefined)
  invoiceDate?: string;

  @IsDecimal({ decimal_digits: '2', force_decimal: true }, { message: 'O limite do cartão deve ser um número decimal com 2 casas decimais.' })
  @ValidateIf((_, value) => value !== undefined)
  limitBalance?: string;

  @IsDateString({}, { message: 'A data de fechamento da fatura deve ser uma data válida.' })
  @ValidateIf((_, value) => value !== undefined)
  invoicePayment?: string;
}
