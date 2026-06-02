#!/usr/bin/env bash
# Serverni "tozalash" — keshlar, eski build, shishган loglar va PM2'ni tiklaydi.
# Ma'lumotlar bazasiga TEGMAYDI (xavfsiz). Ishlatish:  bash scripts/clean.sh
set -e
cd "$(dirname "$0")/.."

echo "==> 1. PM2 loglarni saqlab, keyin tozalash (disk to'lib qolmasligi uchun)"
# Tozalashdan OLDIN xato logining oxirini saqlaymiz — keyin sabab kerak bo'lsa qoladi.
mkdir -p logs-archive
ERR_LOG="$HOME/.pm2/logs/quiz-bot-error.log"
if [ -f "$ERR_LOG" ] && [ -s "$ERR_LOG" ]; then
  STAMP=$(date +%Y%m%d-%H%M%S)
  tail -n 200 "$ERR_LOG" > "logs-archive/error-$STAMP.log"
  echo "    Eski xato logi saqlandi: logs-archive/error-$STAMP.log"
fi
pm2 flush || true

echo "==> 2. Eski build (dist) o'chirib, qayta yig'ish"
rm -rf dist
npm run build

echo "==> 3. npm keshini tozalash"
npm cache clean --force || true

echo "==> 4. Prisma clientni qayta generatsiya qilish"
npx prisma generate

echo "==> 5. Botni qayta ishga tushirish (xotira/timerlarni tozalaydi)"
pm2 restart quiz-bot --update-env

echo "==> 6. Holat"
pm2 status quiz-bot
df -h / | tail -1
echo "TAYYOR ✅  Loglar:  pm2 logs quiz-bot --lines 30"
