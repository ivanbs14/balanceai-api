import { IsNotEmpty, IsString } from "class-validator";

export class LinkFixedCostMonthlyDto {
  @IsString()
  @IsNotEmpty()
  transactionId: string;
}
