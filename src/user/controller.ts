import {
  Controller,
  Body,
  Post,
  Get,
  Param,
  Put,
  Delete,
} from "@nestjs/common";
import { CreateUserDto } from "./dto/create.dto";
import { UserService } from "./service";
import { UpdateUserDto } from "./dto/updated.dto";

@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async create(@Body() data: CreateUserDto) {
    const { name, document, email, password, role } = data;
    return this.userService.create(name, document, email, password, role);
  }

  @Get()
  async getAll() {
    return this.userService.getAll();
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    return this.userService.getById(id);
  }

  @Put(":id")
  async update(@Param("id") id: string, @Body() data: UpdateUserDto) {
    return this.userService.update(id, data);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    return this.userService.delete(id);
  }
}
