import {
  Matches,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from "class-validator";
import { TransationPaymentMethod } from "@prisma/client";
import { POSITIVE_MONEY_PATTERN } from "../../common/money";

export class UpdateInstallmentGroupDto {
  @IsString()
  name: string;

  @Matches(POSITIVE_MONEY_PATTERN)
  amount: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  Date: string;

  @IsInt({ message: "A quantidade de parcelas deve ser um numero inteiro." })
  @Min(1, { message: "A quantidade minima de parcelas pendentes e 1." })
  @Max(24, { message: "A quantidade maxima para editar grupo parcelado e 24." })
  installments: number;

  @IsEnum(TransationPaymentMethod)
  paymentMethod: TransationPaymentMethod;

  @ValidateIf((o) => o.paymentMethod === TransationPaymentMethod.CREDIT_CARD)
  @IsString({
    message: "O cardId e obrigatorio para pagamentos com cartao de credito.",
  })
  cardId?: string;

  @IsOptional()
  @IsString()
  nameCard?: string;
}
