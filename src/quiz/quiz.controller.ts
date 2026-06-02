import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, Res,
  Headers, UnauthorizedException, ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { QuizService } from './quiz.service';

function checkAuth(secret: string) {
  if (secret !== process.env.ADMIN_SECRET) {
    throw new UnauthorizedException('Ruxsat yo\'q');
  }
}

@Controller('api')
export class QuizController {
  constructor(private quizService: QuizService) {}

  @Get('health')
  health() {
    return this.quizService.health();
  }

  @Get('quizzes')
  findAll() {
    return this.quizService.findAll();
  }

  // Telegram cheklovidan oshgan (poll yuborilmaydigan) savollarni topadi.
  // Hammasi: /api/validate   bitta test: /api/validate?quizId=12
  @Get('validate')
  validate(@Query('quizId') quizId?: string) {
    const id = quizId ? parseInt(quizId) : undefined;
    return this.quizService.findInvalidQuestions(id && !isNaN(id) ? id : undefined);
  }

  @Get('quizzes/active')
  findActive() {
    return this.quizService.findActive();
  }

  // Faol testlar fan bo'yicha guruhlangan holda (blok/preset uchun)
  @Get('subjects')
  getSubjects() {
    return this.quizService.getSubjectGroups();
  }

  // Tanlangan testlarning savollarini CSV qilib yuklab beradi
  @Get('export/csv')
  async exportCsv(@Query('quizIds') quizIds: string, @Res() res: Response) {
    const ids = (quizIds || '')
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n));
    const { filename, csv } = await this.quizService.exportCsv(ids);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM — Excel uchun UTF-8
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

  // ─── Avto blok presetlari ───────────────────────────────────────────
  @Get('presets')
  findPresets() {
    return this.quizService.findPresets();
  }

  @Post('presets')
  createPreset(@Headers('x-admin-secret') secret: string, @Body() body: any) {
    checkAuth(secret);
    return this.quizService.createPreset(body);
  }

  @Delete('presets/:id')
  removePreset(
    @Headers('x-admin-secret') secret: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    checkAuth(secret);
    return this.quizService.removePreset(id);
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

  @Get('quizzes/:id/question-stats')
  getQuestionStats(@Param('id', ParseIntPipe) id: number) {
    return this.quizService.getQuestionStats(id);
  }

  @Get('leaderboard')
  leaderboard() {
    return this.quizService.getGlobalLeaderboard();
  }

  @Get('quizzes/:id/results-csv')
  async resultsCsv(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { filename, csv } = await this.quizService.exportResultsCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv);
  }
}
