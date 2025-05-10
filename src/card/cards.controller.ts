/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { CardService } from './card.service';

@Controller('cards')
export class CardController {
  constructor(private readonly cardService: CardService) {}

  @Post()
  create(@Body() createCardDto: CreateCardDto) {
    return this.cardService.create(createCardDto);
  };

  @Get()
  findAll() {
    return this.cardService.findAll();
  };

  @Get(':userId')
  async findAllByUserId(@Param('userId') userId: string) {
    const cards = await this.cardService.findAllByUserId(userId);
    return { data: cards };
  };

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cardService.findOne(id);
  };

  @Get('transation/:cardId')
  async findTransationsByCard(
    @Param('cardId') cardId: string,
    @Query('date') date?: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
  ) {
    return this.cardService.findTransationsByCard(
      cardId,
      date,
      Number(page),
      Number(pageSize),
    );
  };

  @Get('transations/:id')
  findCardTransations(@Param('id') cardId: string) {
    return this.cardService.findCardTransations(cardId);
  };

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCardDto: UpdateCardDto) {
    return this.cardService.update(id, updateCardDto);
  };

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cardService.remove(id);
  };
};
