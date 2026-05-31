import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  // DB vaqtincha ko'tarilmagan bo'lsa ham ilova yiqilmasin — bir necha bor
  // qayta urinamiz, baribir ulanmasa ishga tushaveramiz (Prisma birinchi
  // so'rovda avtomatik ulanadi).
  async onModuleInit() {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.$connect();
        this.logger.log('✅ Bazaga ulandi');
        return;
      } catch (e: any) {
        this.logger.error(`DB ulanish urinishi ${attempt}/5 muvaffaqiyatsiz: ${e.message}`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    this.logger.warn('⚠️ DB ga dastlab ulanib bo\'lmadi — ilova ishlaydi, so\'rovlarda qayta urinadi');
  }

  async onModuleDestroy() {
    try { await this.$disconnect(); } catch { /* ignore */ }
  }
}
