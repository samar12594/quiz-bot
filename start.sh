#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "🚀 ngrok ishga tushmoqda..."

# Kill any existing ngrok
pkill -f "ngrok http" 2>/dev/null || true
sleep 1

# Start ngrok in background
ngrok http 3000 --log=stdout > /tmp/ngrok_quiz.log 2>&1 &
NGROK_PID=$!

# Wait for ngrok tunnel to open
for i in $(seq 1 15); do
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
    | grep -o '"public_url":"https://[^"]*"' \
    | head -1 \
    | sed 's/"public_url":"//;s/"//')
  if [ -n "$NGROK_URL" ]; then break; fi
  sleep 1
done

if [ -z "$NGROK_URL" ]; then
  echo "⚠️  Ngrok ulanmadi — APP_URL yangilanmaydi"
  echo "   (ngrok akkaunt token kerak bo'lishi mumkin: ngrok.com)"
else
  echo "✅ Ngrok URL: $NGROK_URL"
  # Update APP_URL in .env
  if grep -q "^APP_URL=" .env 2>/dev/null; then
    sed -i '' "s|^APP_URL=.*|APP_URL=$NGROK_URL|" .env
  else
    echo "APP_URL=$NGROK_URL" >> .env
  fi
  echo "✅ .env faylda APP_URL yangilandi"
fi

echo ""
echo "🤖 Server ishga tushmoqda..."
echo "   Admin panel : ${NGROK_URL:-http://localhost:3000}/admin"
echo "   Quiz sayt   : ${NGROK_URL:-http://localhost:3000}/app"
echo ""

# Start the dev server
npm run dev
