/* eslint-disable prettier/prettier */
import { IsString, Matches, ValidateIf } from 'class-validator';
import { POSITIVE_MONEY_PATTERN } from '../../common/money';

export class UpdateTransationDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(POSITIVE_MONEY_PATTERN)
  amount?: string;
}
