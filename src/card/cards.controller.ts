import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthPayload } from "../auth/auth.types";
import { CookieAuthGuard } from "../auth/cookie-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { CardService } from "./card.service";
import { CreateCardDto } from "./dto/create-card.dto";
import { UpdateCardDto } from "./dto/update-card.dto";

@Controller("cards")
@UseGuards(CookieAuthGuard)
export class CardController {
  constructor(private readonly cardService: CardService) {}

  @Post()
  create(@Body() data: CreateCardDto, @CurrentUser() user: AuthPayload) {
    return this.cardService.create(data, user.userId);
  }

  @Get()
  findAll(@CurrentUser() user: AuthPayload) {
    return this.cardService.findAll(user.userId);
  }

  @Get("user/:userId")
  async findAllByUserId(
    @Param("userId") userId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    if (userId !== user.userId) throw new ForbiddenException();
    return { data: await this.cardService.findAllByUserId(user.userId) };
  }

  @Get("transation/:cardId")
  findTransationsByCard(
    @Param("cardId") cardId: string,
    @CurrentUser() user: AuthPayload,
    @Query("date") date?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const parsePositive = (
      value: string | undefined,
      fallback: number,
      max?: number,
    ) => {
      if (value === undefined) return fallback;
      if (!/^[1-9]\d*$/.test(value))
        throw new BadRequestException("Paginação inválida.");
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || (max && parsed > max))
        throw new BadRequestException("Paginação inválida.");
      return parsed;
    };
    return this.cardService.findTransationsByCard(
      cardId,
      user.userId,
      date,
      parsePositive(page, 1),
      parsePositive(pageSize, 10, 100),
    );
  }

  @Get("transations/:id")
  findCardTransations(
    @Param("id") id: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.cardService.findCardTransations(id, user.userId);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthPayload) {
    return this.cardService.findOne(id, user.userId);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() data: UpdateCardDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.cardService.update(id, user.userId, data);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthPayload) {
    return this.cardService.remove(id, user.userId);
  }
}
