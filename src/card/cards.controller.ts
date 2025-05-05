/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { CardService } from './card.service';

@Controller('cards')
export class CardController {
  constructor(private readonly cardService: CardService) {}

  @Post()
  create(@Body() createCardDto: CreateCardDto) {
    return this.cardService.create(createCardDto);
  }

  @Get()
  findAll() {
    return this.cardService.findAll();
  }

  @Get(':userId')
  findAllByUserId(@Param('id') id: string) {
    return this.cardService.findAllByUserId(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cardService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCardDto: UpdateCardDto) {
    return this.cardService.update(id, updateCardDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cardService.remove(id);
  }
}
