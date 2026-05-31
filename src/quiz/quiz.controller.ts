import {
  Controller, Get, Post, Put, Delete, Param, Body,
  Headers, UnauthorizedException, ParseIntPipe,
} from '@nestjs/common';
import { QuizService } from './quiz.service';

function checkAuth(secret: string) {
  if (secret !== process.env.ADMIN_SECRET) {
    throw new UnauthorizedException('Ruxsat yo\'q');
  }
}

@Controller('api')
export class QuizController {
  constructor(private quizService: QuizService) {}

  @Get('quizzes')
  findAll() {
    return this.quizService.findAll();
  }

  @Get('quizzes/active')
  findActive() {
    return this.quizService.findActive();
  }

  @Get('quizzes/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.quizService.findOne(id);
  }

  @Post('quizzes')
  create(@Headers('x-admin-secret') secret: string, @Body() body: any) {
    checkAuth(secret);
    return this.quizService.create(body);
  }

  @Post('quizzes/blok')
  createBlok(@Headers('x-admin-secret') secret: string, @Body() body: any) {
    checkAuth(secret);
    return this.quizService.createBlok(body);
  }

  @Put('quizzes/:id')
  update(
    @Headers('x-admin-secret') secret: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    checkAuth(secret);
    return this.quizService.update(id, body);
  }

  @Delete('quizzes/:id')
  remove(
    @Headers('x-admin-secret') secret: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    checkAuth(secret);
    return this.quizService.remove(id);
  }

  @Get('quizzes/:id/questions')
  getQuestions(@Param('id', ParseIntPipe) id: number) {
    return this.quizService.getQuestions(id);
  }

  @Post('quizzes/:id/questions')
  addQuestion(
    @Headers('x-admin-secret') secret: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    checkAuth(secret);
    return this.quizService.addQuestion(id, body);
  }

  @Delete('questions/:id')
  removeQuestion(
    @Headers('x-admin-secret') secret: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    checkAuth(secret);
    return this.quizService.removeQuestion(id);
  }

  @Get('quizzes/:id/stats')
  getStats(@Param('id', ParseIntPipe) id: number) {
    return this.quizService.getStats(id);
  }
}
