import { Controller, Body, Post } from "@nestjs/common";
import { CreateUserDto } from "./dto/create.dto";
import { UserService } from "./service";

@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async create(@Body() data: CreateUserDto) {
    const { name, document, email, password } = data;
    return this.userService.create(name, document, email, password);
  }
}
