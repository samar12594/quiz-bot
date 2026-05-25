import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { EventsService } from './events.service';

@Controller('api/events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Get(':key')
  subscribe(@Param('key') key: string, @Res() res: Response) {
    this.eventsService.subscribe(key, res);
  }
}
