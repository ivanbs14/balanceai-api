/* eslint-disable prettier/prettier */
import {
  IsNotEmpty,
  IsEnum,
  IsString,
  Matches,
  ValidateIf,
  IsInt,
  Max,
  Min,
  IsOptional,
  IsBoolean,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { TransationType, TransationCategory, TransationPaymentMethod } from '@prisma/client';
import { POSITIVE_MONEY_PATTERN } from '../../common/money';

@ValidatorConstraint({ name: 'IsWithdrawalValid', async: false })
class IsWithdrawalValidConstraint implements ValidatorConstraintInterface {
  validate(withdrawal: any, args: ValidationArguments) {
    const obj = args.object as any;
    if (obj.type === TransationType.EXPENSE) {
      return withdrawal === TransationType.DEPOSIT || withdrawal === TransationType.INVESTMENT;
    }
    return withdrawal === null || withdrawal === undefined;
  }

  defaultMessage() {
    return `O campo 'withdrawal' só pode ser 'DEPOSIT' ou 'INVESTMENT' quando 'type' for 'EXPENSE'. Deve ser nulo caso contrário.`;
  }
}

export class CreateTransationDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  userId?: string;

  @IsEnum(TransationType)
  type: TransationType;

  @IsString()
  @Matches(POSITIVE_MONEY_PATTERN)
  amount: string;

  @IsEnum(TransationCategory)
  category: TransationCategory;

  @IsEnum(TransationPaymentMethod)
  paymentMethod: TransationPaymentMethod;

  @IsOptional()
  @IsBoolean()
  isFixed?: boolean;

  @ValidateIf(
    (o) =>
      o.paymentMethod === TransationPaymentMethod.CREDIT_CARD ||
      o.installments !== undefined,
  )
  @IsInt({ message: 'A quantidade de parcelas deve ser um número inteiro' })
  @Min(1, { message: 'A quantidade mínima de parcelas é 1' })
  @Max(24, { message: 'A quantidade máxima de parcelas é 24' })
  installments?: number;

  @IsOptional()
  nameCard?: string;

  @IsOptional()
  cardId?: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  Date: string;

  @IsOptional()
  @Validate(IsWithdrawalValidConstraint)
  withdrawal?: TransationType;
}
