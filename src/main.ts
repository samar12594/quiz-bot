import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { join } from 'path';
import { execSync } from 'child_process';

// Ushlanmagan xatolar process'ni YIQITMASIN — bot uzluksiz ishlashi uchun
// shunchaki loglaymiz. (Telegram API uzilishi, kutilmagan promise va h.k.)
process.on('unhandledRejection', (reason: any) => {
  console.error('⚠️ unhandledRejection:', reason?.stack || reason);
});
process.on('uncaughtException', (err: any) => {
  console.error('⚠️ uncaughtException:', err?.stack || err);
});

// Port band bo'lsa, eski jarayonni avtomatik o'ldiramiz (dev rejimi)
// Hot-reload paytida nodemon eski jarayonni to'liq yopib ulgurmasligi mumkin
function killPortHolder(port: number | string) {
  try {
    const out = execSync(`lsof -ti:${port}`, { stdio: ['pipe', 'pipe', 'ignore'] })
      .toString().trim();
    if (!out) return false;
    const pids = out.split('\n').filter(Boolean);
    if (!pids.length) return false;
    console.log(`⚠️  ${port} porti band edi — eski jarayon(lar) o'chirilmoqda: ${pids.join(', ')}`);
    for (const pid of pids) {
      if (String(process.pid) === pid) continue; // o'zimizni o'ldirib qo'ymaylik
      try { execSync(`kill -9 ${pid}`); } catch { /* ignore */ }
    }
    return true;
  } catch {
    return false;
  }
}

async function bootstrap() {
  const port = process.env.PORT || 3000;

  let app: NestExpressApplication | null = null;
  let lastErr: any = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      app = await NestFactory.create<NestExpressApplication>(AppModule);
      app.useStaticAssets(join(__dirname, '..', 'public'));
      app.enableCors();
      app.useGlobalFilters(new AllExceptionsFilter());
      await app.listen(port);
      lastErr = null;
      break;
    } catch (e: any) {
      lastErr = e;
      // Graceful close of partially-created app before retry
      try { await app?.close(); } catch { /* ignore */ }
      app = null;

      if (e?.code === 'EADDRINUSE' && attempt === 1) {
        const killed = killPortHolder(port);
        if (!killed) break;
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      break;
    }
  }

  if (lastErr) {
    if (lastErr.code === 'EADDRINUSE') {
      console.error(`\n❌ ${port}-port hali ham band. Quyidagilardan birini bajaring:`);
      console.error(`   • Boshqa terminalda:  lsof -ti:${port} | xargs kill -9`);
      console.error(`   • Yoki .env faylda boshqa port belgilang: PORT=3001\n`);
      process.exit(1);
    }
    throw lastErr;
  }

  // Toza yopilish — sigterm/sigint da port chiqarilsin
  const shutdown = async (sig: string) => {
    console.log(`\n👋 ${sig} signal — server yopilmoqda...`);
    try { await app?.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart

  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`🖥️  Admin panel: http://localhost:${port}/admin`);
  console.log(`🤖 Telegram bot is active`);
}
bootstrap();
