#!/bin/bash
# Baza zaxirasi (backup). Cron orqali har kuni ishga tushirish tavsiya etiladi.
# Misol (har kuni soat 03:00 da):
#   crontab -e
#   0 3 * * * /var/www/quiz-bot/scripts/backup.sh >> /var/www/quiz-bot/backups/backup.log 2>&1
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# .env dan DATABASE_URL ni o'qiymiz
if [ -f .env ]; then
  export $(grep -E '^DATABASE_URL=' .env | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL topilmadi (.env tekshiring)"
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$DIR/backups}"
mkdir -p "$BACKUP_DIR"

STAMP=$(date +%Y-%m-%d_%H-%M-%S)
FILE="$BACKUP_DIR/quizbot_$STAMP.sql.gz"

echo "🗄  Zaxira yaratilmoqda: $FILE"
pg_dump "$DATABASE_URL" | gzip > "$FILE"

# Oxirgi 14 ta zaxirani saqlab, eskilarini o'chiramiz
ls -1t "$BACKUP_DIR"/quizbot_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

COUNT=$(ls -1 "$BACKUP_DIR"/quizbot_*.sql.gz 2>/dev/null | wc -l)
echo "✅ Tayyor. Jami zaxiralar: $COUNT ta (oxirgi 14 tasi saqlanadi)"
echo "   Tiklash: gunzip -c $FILE | psql \"\$DATABASE_URL\""
