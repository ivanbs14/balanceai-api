/* eslint-disable prettier/prettier */
import {
  IsNotEmpty,
  IsEnum,
  IsDecimal,
  IsDateString,
  ValidateIf,
  IsInt,
  Min,
  IsOptional,
  IsBoolean,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { TransationType, TransationCategory, TransationPaymentMethod } from '@prisma/client';

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
  name: string;

  @IsNotEmpty()
  userId: string;

  @IsEnum(TransationType)
  type: TransationType;

  @IsDecimal()
  amount: number;

  @IsEnum(TransationCategory)
  category: TransationCategory;

  @IsEnum(TransationPaymentMethod)
  paymentMethod: TransationPaymentMethod;

  @IsOptional()
  @IsBoolean()
  isFixed?: boolean;

  @ValidateIf((o) => o.paymentMethod === TransationPaymentMethod.CREDIT_CARD)
  @IsInt({ message: 'A quantidade de parcelas deve ser um número inteiro' })
  @Min(1, { message: 'A quantidade mínima de parcelas é 1' })
  installments?: number;

  @IsOptional()
  nameCard?: string;

  @IsOptional()
  cardId?: string;

  @IsDateString()
  Date: string;

  @IsOptional()
  @Validate(IsWithdrawalValidConstraint)
  withdrawal?: TransationType;
}
