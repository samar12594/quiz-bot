#!/usr/bin/env bash
# Serverni "tozalash" — keshlar, eski build, shishган loglar va PM2'ni tiklaydi.
# Ma'lumotlar bazasiga TEGMAYDI (xavfsiz). Ishlatish:  bash scripts/clean.sh
set -e
cd "$(dirname "$0")/.."

echo "==> 1. PM2 loglarni tozalash (disk to'lib qolmasligi uchun)"
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
