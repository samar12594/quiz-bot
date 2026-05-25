# QuizBot V2.0 — To'liq Qo'llanma

## Tezkor ishga tushirish (barchasi tayyor!)

```bash
# 1. Loyiha papkasiga kiring
cd quiz-bot

# 2. Database jadvallarini yarating (birinchi marta)
npm run setup

# 3. Serverni ishga tushiring
npm run dev
```

Muvaffaqiyatli bo'lsa terminalda ko'rasiz:
```
🚀 Server running on http://localhost:3000
🖥️  Admin panel: http://localhost:3000/admin
🤖 Telegram bot is active
```

---

## .env fayl sozlamalari

`quiz-bot/.env` faylida:

```env
DATABASE_URL="postgresql://postgres@localhost:5432/quizbot"
TELEGRAM_BOT_TOKEN="7857453694:AAHHaXY8sN9chxewJti5025DqbEOX9APuIk"
ADMIN_SECRET="mysecret123"
PORT=3000
```

| Kalit | Nima | Sizniki |
|---|---|---|
| `DATABASE_URL` | PostgreSQL manzili | `postgresql://postgres@localhost:5432/quizbot` |
| `TELEGRAM_BOT_TOKEN` | Bot tokeni | BotFather dan olindi |
| `ADMIN_SECRET` | Admin panel paroli | `mysecret123` (o'zgartiring!) |
| `PORT` | Server porti | `3000` |

---

## Telegram Bot Token olish (yangi bot uchun)

1. Telegramni oching → **@BotFather** ni qidiring
2. `/newbot` yuboring
3. Bot nomini kiriting: masalan `Quiz Bot`
4. Bot username kiriting: masalan `myquiz_test_bot` (oxiri `bot` bo'lishi shart)
5. Shunday token keladi:

```
Done! Congratulations on your new bot.
Use this token to access the HTTP API:
7857453694:AAHHaXY8sN9chxewJti5025DqbEOX9APuIk
```

6. Bu tokenni `.env` fayliga `TELEGRAM_BOT_TOKEN=` ga yozing

---

## Admin Panel

**Manzil:** http://localhost:3000/admin

**Kirish:** `mysecret123` (`.env`dagi `ADMIN_SECRET`)

### Sahifalar:

#### Dashboard
- Barcha testlar ro'yxati
- Testni yoqish/o'chirish (🟢/🔴)
- Savollarni tahrirlash (✏️)
- Testni o'chirish (🗑️)

#### Test yaratish
1. Test nomini kiriting
2. Vaqt limitini belgilang (soniyada)
3. "Test yaratish" tugmasini bosing
4. Savollar qo'shishni boshlang (A, B, C, D variantlar)

#### CSV Import
1. "Shablon yuklab olish" tugmasi bilan shablon oling
2. Shablon formatida savollarni to'ldiring
3. Faylni yuklang → Preview ko'ring
4. "Import qilish" tugmasi

**CSV format:**
```csv
quiz_title,question,option_a,option_b,option_c,option_d,correct,explain
"Matematika","2+2=?","3","4","5","6","B","Ikki sonni qo'shish"
"Matematika","5*5=?","20","25","30","15","B",""
"Ingliz tili","Apple nima?","Olma","Nok","Banan","Uzum","A",""
```

> `correct` ustuniga faqat `A`, `B`, `C`, yoki `D` yozing

#### Natijalar
- Test tanlang → barcha sessiyalar ko'rinadi
- Har bir sessiyada ishtirokchilar reytingi

---

## Botni Telegramda ishlatish

### Shaxsiy chatda (test uchun):
Bot bilan to'g'ridan-to'g'ri chat oching va:
```
/start   — Xush kelibsiz xabari
/quiz    — Testlar ro'yxati
```

### Guruhda ishlatish:

**1. Botni guruhga qo'shish:**
- Guruhni oching
- Guruh nomi → "Guruh a'zolari" → "+" → Botni qidiring → Qo'shing

**2. Bot uchun ruxsat berish:**
- Guruh sozlamalari → Administratorlar → Botni admin qiling
- Kamida "Xabar yuborish" ruxsatini bering

**3. Guruhda buyruqlar:**

| Buyruq | Natija |
|---|---|
| `/quiz` | Mavjud testlar ro'yxati chiqadi |
| Test tugmasini bosing | Test boshlanadi |
| A/B/C/D tugmalaridan birini bosing | Javob qayd etiladi |
| `/score` | Joriy natijalar |
| `/stop` | Testni to'xtatish |

### Test jarayoni:
```
Sen: /quiz

Bot: 📋 Qaysi testni boshlashni tanlang:
     [📚 Matematika testi (10 savol)]
     [📚 Ingliz tili (5 savol)]

Sen: [Matematika testi] bosasiz

Bot: 🎯 Matematika testi boshlanmoqda!
     📊 Savollar soni: 10
     ⏱ Har bir savol uchun: 30 soniya

Bot: 📝 Savol 1/10
     2+2 nechaga teng?
     [A. 3]  [B. 4]
     [C. 5]  [D. 6]

Siz A ni bosasiz:
Bot: ❌ Noto'g'ri! To'g'ri javob: B

Guruh a'zosi B ni bosadi:
Bot: ✅ To'g'ri! B variant

... (barcha savollar) ...

Bot: 📊 Test yakunlandi: Matematika

🏆 Natijalar:
🥇 @ali_dev      — 9/10 (90%)
🥈 @sara_99      — 7/10 (70%)
🥉 @john_uz      — 5/10 (50%)

⏱ Vaqt: 4:32
✅ Jami ishtirokchilar: 3
```

---

## Foydali buyruqlar

```bash
# Serverni ishga tushirish (asosiy buyruq)
npm run dev

# Database vizual editor (brauzerda)
npm run prisma:studio

# Database jadvallarini qayta yaratish
npm run setup

# Loyihani build qilish (production)
npm run build
npm start
```

---

## Xatolar va yechimlari

| Xato | Sabab | Yechim |
|---|---|---|
| `Environment variable not found: DATABASE_URL` | `.env` fayl yo'q | `.env` fayl bor-yo'qligini tekshiring |
| `Can't reach database server` | PostgreSQL ishlamayapti | `brew services start postgresql` yoki `pg_ctl start` |
| `Bot token invalid` | Token noto'g'ri | BotFather dan tokenni qayta oling |
| `Port 3000 already in use` | Boshqa jarayon ishlamoqda | `lsof -ti:3000 \| xargs kill` keyin qayta ishga tushiring |
| `Prisma client not generated` | Generate qilinmagan | `npm run setup` |

---

## Fayl tuzilmasi

```
quiz-bot/
├── .env                    ← Sozlamalar (TOKEN, DB, SECRET)
├── .env.example            ← Namuna
├── prisma/
│   └── schema.prisma       ← Database jadvallari
├── src/
│   ├── main.ts             ← Server start nuqtasi
│   ├── app.module.ts       ← Asosiy modul
│   ├── prisma/             ← Database ulanish
│   ├── bot/
│   │   ├── bot.module.ts
│   │   ├── bot.service.ts  ← Quiz sessiya mantigi
│   │   └── bot.update.ts   ← /quiz, /stop, /score buyruqlari
│   ├── quiz/
│   │   ├── quiz.service.ts ← Test CRUD
│   │   └── quiz.controller.ts ← REST API
│   ├── import/
│   │   ├── import.service.ts  ← CSV parsing
│   │   └── import.controller.ts
│   └── admin/
│       └── admin.controller.ts ← /admin route
└── public/
    ├── index.html          ← Admin panel UI
    ├── css/style.css
    ├── js/app.js
    └── template.csv        ← CSV shablon
```

---

## Production uchun (serverga deploy)

```bash
# .env faylini to'liq to'ldiring
# Build
npm run build

# Ishga tushirish
npm start
```

PM2 bilan (process manager):
```bash
npm install -g pm2
npm run build
pm2 start dist/main.js --name quiz-bot
pm2 save
pm2 startup
```
