import {
  Controller, Post, UploadedFile, UseInterceptors,
  Headers, UnauthorizedException, Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ImportService } from './import.service';

function checkAuth(secret: string) {
  if (secret !== process.env.ADMIN_SECRET) {
    throw new UnauthorizedException('Ruxsat yo\'q');
  }
}

function toBool(v: any, def = true): boolean {
  if (v === undefined || v === null || v === '') return def;
  return v === 'true' || v === true || v === '1' || v === 1;
}

@Controller('api/import')
export class ImportController {
  constructor(private importService: ImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async preview(
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-admin-secret') secret: string,
  ): Promise<any[]> {
    checkAuth(secret);
    return this.importService.previewCSV(file.buffer);
  }

  @Post('csv')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importCsv(
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-admin-secret') secret: string,
    @Body() body: any,
  ) {
    checkAuth(secret);
    const timeLimit = body?.timeLimit ? parseInt(body.timeLimit) : undefined;
    const opts = {
      customTitle: body?.customTitle?.trim() || undefined,
      timeLimit: timeLimit && timeLimit >= 5 ? timeLimit : undefined,
      shuffleQ: body?.shuffleQ !== undefined ? toBool(body.shuffleQ) : undefined,
      shuffleA: body?.shuffleA !== undefined ? toBool(body.shuffleA) : undefined,
      mode: (body?.mode as 'append' | 'replace' | 'rename' | 'auto') || 'auto',
      newTitle: body?.newTitle?.trim() || undefined,
    };
    return this.importService.importCSV(file.buffer, opts);
  }
}
