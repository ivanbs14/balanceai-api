/* eslint-disable prettier/prettier */
import { IsString, IsNotEmpty, Matches, ValidateIf } from 'class-validator';
import { POSITIVE_MONEY_PATTERN } from '../../common/money';

export class UpdateCardDto {
  @IsString()
  @ValidateIf((_, value) => value !== undefined)
  @IsNotEmpty()
  name?: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  @ValidateIf((_, value) => value !== undefined)
  invoiceDate?: string;

  @Matches(POSITIVE_MONEY_PATTERN)
  @ValidateIf((_, value) => value !== undefined)
  limitBalance?: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  @ValidateIf((_, value) => value !== undefined)
  invoicePayment?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  userId?: string;
}
