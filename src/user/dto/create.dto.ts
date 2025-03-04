/* eslint-disable prettier/prettier */
import { IsNotEmpty } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  document: string;

  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  password: string;

}
