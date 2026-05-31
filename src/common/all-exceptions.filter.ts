import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

// Barcha xatolarni ushlaydi — process yiqilmaydi, foydalanuvchiga toza
// JSON javob qaytadi. Stack-trace tashqariga chiqmaydi.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    // HTTP konteksti bo'lmasa (masalan, telegraf) — faqat loglaymiz
    if (!res || typeof res.status !== 'function') {
      this.logger.error('Non-HTTP xato:', (exception as any)?.stack || exception);
      return;
    }

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Server xatoligi';
    if (exception instanceof HttpException) {
      const r = exception.getResponse() as any;
      message = typeof r === 'string' ? r : (r?.message || message);
    }

    if (status >= 500) {
      this.logger.error(`${status} — ${(exception as any)?.message}`, (exception as any)?.stack);
    }

    res.status(status).json({
      statusCode: status,
      message,
    });
  }
}
