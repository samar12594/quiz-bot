import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller()
export class AdminController {
  @Get('admin')
  serveAdmin(@Res() res: Response) {
    res.sendFile(join(process.cwd(), 'public', 'index.html'));
  }

  @Get('admin/*path')
  serveAdminWildcard(@Res() res: Response) {
    res.sendFile(join(process.cwd(), 'public', 'index.html'));
  }

  @Get('app')
  serveApp(@Res() res: Response) {
    res.sendFile(join(process.cwd(), 'public', 'app.html'));
  }
}
