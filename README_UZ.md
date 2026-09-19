# BeshBall — Besh Bola Lavash

Telegram mijoz boti, Fastify API, React admin/kassir Mini App, PostgreSQL, Redis/BullMQ va yopiq S3 omboridan iborat monorepo. 1 BeshBall = 100 000 so‘mlik tegishli xarid. Asosiy til o‘zbekcha; bot rus tilini ham qo‘llaydi.

## Shu kompyuterda ishga tushirish

Loyiha serverga ko‘chirildi: **https://beshball.onrender.com**.
Bot: **https://t.me/beshball_bot**. Telegram chat menyusidagi «Admin panel» yoki
`/admin` → «Admin panelni ochish» orqali panelga kiring.
Bosh admin ID: `5916247309`. Kompyuter yoqilgan turishi shart emas.
`npm.cmd run status` serverni tekshiradi. Bepul tarifdagi uyqu va uyg‘onish cheklovlari
uchun [joylashtirish qo‘llanmasi](DEPLOY_FREE_UZ.md)ni ko‘ring.

Quyidagi lokal tartib rivojlantirish uchun. Ushbu kompyuterda cloud belgisi faol
bo‘lsa launcher lokal botni qayta yoqmaydi.

`start-beshball.cmd` faylini oching yoki loyiha ildizida `npm.cmd start` bajaring.
Bu buyruq mavjud lokal PostgreSQL, Redis va MinIO xizmatlarini tekshiradi,
migratsiya va seedni bajaradi, backend, OCR worker, Telegram bot va adminni
ishga tushiradi. Kod o‘zgargan bo‘lsa oldin `npm.cmd run build` bajaring.
Bot: https://t.me/beshball_bot. Admin: http://localhost:5173.
Terminaldagi `Ctrl+C` shu buyruq boshlagan jarayonlarni to‘xtatadi.
Loglar `.runtime/*.stdout.log` va `.runtime/*.stderr.log` fayllarida.

Mavjud lokal ma’lumotlar `.runtime`da saqlanadi; katalogni o‘chirmang.
Ishga tushirish skripti navbatdagi reklama va avtomatik jo‘natmalarni yoqmaydi;
bot foydalanuvchi buyruqlariga javob beradi, OCR worker cheklar bilan ishlaydi.
Serverdagi HTTPS `ADMIN_URL` va `SUPER_ADMIN_TELEGRAM_IDS` sozlangan.
Cloud worker chek, ball va rezerv haqida xizmat xabarlarini yuboradi;
reklama jo‘natmalari o‘chiq. Cheklar admin tasdig‘idan keyin ballga aylanadi.

## Mahalliy ishga tushirish

Node.js 22.14 yoki yangi 22 LTS, npm, Docker Compose kerak. Windows PowerShell’da `npm` o‘rniga `npm.cmd` ishlating. ZIPni ochgach, ichidagi `beshball` katalogiga kiring.

```sh
npm ci
npm run setup:local
npm run prisma:generate
npm run build
docker compose up -d postgres redis minio
npm run prisma:migrate
npm run seed
```

`setup:local` yo‘q `.env`ni xavfsiz tasodifiy parollar bilan yaratadi. `.env` mavjud bo‘lsa, uni o‘zgartirmaydi; yetishmagan qiymatlarni `.env.generated`ga yozadi. `.env`da mahalliy DATABASE_URL va S3 qiymatlari haqiqiy xizmatlarga mos bo‘lsin. PostgreSQL porti 5432, Redis 6379, MinIO 9000.

Alohida terminallarda:

```sh
npm run dev:backend
npm run dev:worker
npm run dev:admin
```

API: http://localhost:3000/health, baza holati: http://localhost:3000/ready. Admin: http://localhost:5173. Admin autentifikatsiyasi haqiqiy Telegram initData va faol xodimni talab qiladi; oddiy brauzer uchun demo kirish yo‘q.

Docker bilan API/worker/admin: `docker compose up -d --build backend worker admin`. Admin manzili http://localhost:8080; `.env`dagi ADMIN_URLni ishlatiladigan manzilga moslang. Migratsiya va seedni xizmatlar ishga tushishidan oldin bajaring.

## Telegramni ulash

BotFather tokenini TELEGRAM_BOT_TOKENga, haqiqiy bosh admin Telegram IDlarini vergul bilan SUPER_ADMIN_TELEGRAM_IDSga kiriting va `npm run seed` bajaring. Seed mavjud sovg‘a narxlari va aksiya holatlarini qayta yozmaydi.

TELEGRAM_SEND_ENABLED=false standart holat: bot ishga tushmaydi, worker xabar yubormaydi. Haqiqiy botni ishlatishga tayyor bo‘lgach true qiling va `npm run dev:bot` bajaring. BotFather orqali HTTPS Mini App manzilini sozlang; ADMIN_URL ham shu manzil bo‘lsin. Botdagi `/admin` Mini Appni ochadi.

Mahalliy polling uchun TELEGRAM_WEBHOOK_URL bo‘sh. Production uchun HTTPS TELEGRAM_WEBHOOK_URL, kamida 32 belgili TELEGRAM_WEBHOOK_SECRET va haqiqiy HTTPS ADMIN_URL kerak. Webhook va polling bitta bot jarayonida birga ishlamaydi. Productionda bitta bot consumerini yuriting. Xizmatlarni boshqarish bo‘yicha tafsilot: ARCHITECTURE.md.

## Chek va ZimZim

OCR native Tesseract yoki `OCR_ENGINE=wasm` orqali ishlaydi. Docker backend native eng+rus Tesseractni o‘rnatadi. Windows WASM rejimida OCR_LANG_PATH katalogiga eng.traineddata va rus.traineddata fayllari kerak; OCR_LANGUAGES bilan tillarni tanlang.

OCR hech qachon ball bermaydi. Vakolatli xodim ZimZim’dagi haqiqiy savdo, kassa, filial, vaqt va tegishli summani tekshiradi. ZimZim API hujjati berilmagan: adapter NOT_CONFIGURED. Tafsilot: ZIMZIM_INTEGRATION.md.

## Tekshiruvlar

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

DB sinovlari uchun faqat alohida `beshball_test` bazasiga TEST_DATABASE_URL bering, so‘ng `npm run test:integration`. Runner boshqa nomdagi bazani rad etadi va migratsiyalarni o‘zi qo‘llaydi.

`npm run test:e2e` mavjud Windows lokal sinov muhiti uchun: `.runtime/runtime.json`da TEST_DATABASE_URL, REDIS_URL, S3_ENDPOINT, S3_PUBLIC_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, OCR_ENGINE=wasm, OCR_LANGUAGES va OCR_LANG_PATH bo‘lsin. Google Chrome, ishlab turgan xizmatlar va tayyor admin build kerak. Sinov beshball_test bazasi, alohida S3 bucket va BullMQ navbatidan foydalanadi; Telegramga xabar yubormaydi. .runtime va sirlar ZIPga kirmaydi. Amalda bajarilgan natijalar: TEST_REPORT.md.

## Zaxira va ZIP

Bash, Docker va Node mavjud muhitda:

```sh
bash scripts/backup.sh ./backups/2026-09-12
bash scripts/restore.sh ./backups/2026-09-12 beshball_restored_20260912
npm run zip
```

Restore yangi bazaga yozadi; rasm kalitlari qayta tiklanganda ustiga yozilishi mumkin. Izchil zaxira uchun API, bot va worker yozuvlarini vaqtincha to‘xtating. Tiklangan bazani tekshirgandan keyingina DATABASE_URLni almashtiring. Ushbu sessiyada backup/restore va Docker image build sinovdan o‘tkazilmagan.

`beshball.zip` loyiha ildizida yaratiladi. .env, node_modules, lokal bazalar, rasmlar va .runtime kiritilmaydi. Joylashtirish, haqiqiy Telegram jo‘natmalari va shaxsiy ma’lumot siyosati operator tomonidan sozlanadi; ommaga deploy avtomatik bajarilmaydi.
