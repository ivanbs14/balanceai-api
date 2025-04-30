/* eslint-disable prettier/prettier */
import { IsString, IsDateString, IsDecimal, IsNotEmpty } from 'class-validator';

export class CreateCardDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do cartão é obrigatório.' })
  name: string;

  @IsDateString({}, { message: 'A data de fechamento da fatura deve ser uma data válida.' })
  invoiceDate: string;

  @IsDecimal({ decimal_digits: '2', force_decimal: true }, { message: 'O limite do cartão deve ser um número decimal com 2 casas decimais.' })
  limitBalance: string;

  @IsDecimal({ decimal_digits: '2', force_decimal: true }, { message: 'O valor da fatura deve ser um número decimal com 2 casas decimais.' })
  invoicePayment: string;
}
