import { IsNotEmpty, IsString } from "class-validator";

export class LinkGoogleDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;
}
