import {
  Controller,
  Body,
  Post,
  Get,
  Param,
  Put,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { CreateUserDto } from "./dto/create.dto";
import { UserService } from "./service";
import { UpdateUserDto } from "./dto/updated.dto";
import { CookieAuthGuard } from "../auth/cookie-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthPayload } from "../auth/auth.types";
import { RateLimitService } from "../security/rate-limit.service";

@Controller("user")
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  async create(@Body() data: CreateUserDto, @Req() request: Request) {
    this.rateLimit.checkRegistration(
      request.ip || request.socket.remoteAddress || "unknown",
    );
    const { name, document, email, password } = data;
    return this.userService.create(name, document, email, password);
  }

  @Get()
  @UseGuards(CookieAuthGuard)
  async getAll() {
    return this.userService.getAll();
  }

  @Get(":id")
  @UseGuards(CookieAuthGuard)
  async getById(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.userService.getById(id, user.userId);
  }

  @Put(":id")
  @UseGuards(CookieAuthGuard)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() data: UpdateUserDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.userService.update(id, data, user.userId);
  }

  @Delete(":id")
  @UseGuards(CookieAuthGuard)
  async delete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.userService.delete(id, user.userId);
  }
}
