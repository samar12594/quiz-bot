import { Controller, Post, Get, Body, Param, Headers } from '@nestjs/common';
import { SessionService } from './session.service';

@Controller('api/sessions')
export class SessionController {
  constructor(private sessionService: SessionService) {}

  @Get('active')
  getActive() {
    return this.sessionService.getActiveSessions();
  }

  @Post('solo')
  startSolo(@Body() body: { quizId: number; userId: string; username: string }) {
    return this.sessionService.startSolo(body.quizId, body.userId, body.username);
  }

  @Post(':chatId/answer')
  submitAnswer(
    @Param('chatId') chatId: string,
    @Body() body: { questionId: number; userId: string; username: string; chosen: number },
  ) {
    return this.sessionService.submitWebAnswer(
      chatId, body.questionId, body.userId, body.username, body.chosen,
    );
  }
}
