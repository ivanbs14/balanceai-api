import {
  IsDateString,
  IsDecimal,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { TransationPaymentMethod } from '@prisma/client';

export class UpdateInstallmentGroupDto {
  @IsString()
  name: string;

  @IsDecimal(
    { decimal_digits: '2', force_decimal: true },
    { message: 'O valor deve ser um numero decimal com 2 casas decimais.' },
  )
  amount: string;

  @IsDateString()
  Date: string;

  @IsInt({ message: 'A quantidade de parcelas deve ser um numero inteiro.' })
  @Min(2, { message: 'A quantidade minima para editar grupo parcelado e 2.' })
  installments: number;

  @IsEnum(TransationPaymentMethod)
  paymentMethod: TransationPaymentMethod;

  @ValidateIf((o) => o.paymentMethod === TransationPaymentMethod.CREDIT_CARD)
  @IsString({ message: 'O cardId e obrigatorio para pagamentos com cartao de credito.' })
  cardId?: string;

  @IsOptional()
  @IsString()
  nameCard?: string;
}
