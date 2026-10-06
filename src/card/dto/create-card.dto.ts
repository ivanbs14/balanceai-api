/* eslint-disable prettier/prettier */
import { IsString, IsNotEmpty, Matches, ValidateIf } from 'class-validator';
import { POSITIVE_MONEY_PATTERN } from '../../common/money';

export class CreateCardDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do cartão é obrigatório.' })
  name: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  invoiceDate: string;

  @Matches(POSITIVE_MONEY_PATTERN)
  limitBalance: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  invoicePayment: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  userId?: string;

}
