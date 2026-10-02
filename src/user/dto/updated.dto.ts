import { IsEmail, IsNotEmpty, IsString, ValidateIf } from "class-validator";

export class UpdateUserDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  document?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEmail()
  email?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  password?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  currentPassword?: string;
}
