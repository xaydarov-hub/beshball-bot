# Render + Supabase bepul joylashtirish

## Hozirgi holat

Render Free server yaratildi: https://beshball.onrender.com.
Supabase bazasi va private Storage ulandi. Bot webhook orqali shu serverda ishlaydi.
Bosh admin: `5916247309`. Telegramda https://t.me/beshball_bot ni ochib `/admin`
yuboring va «Ochish» tugmasini bosing. Kompyuter yoqilgan turishi shart emas.

22 ta amaliy jadvaldagi barcha yozuvlar va 2 ta chek rasmi zaxiradan ko‘chirilib,
mazmuni solishtirildi. Lokal zaxiralar `.runtime/cloud-backup-*` ichida saqlandi.
Serverga faqat Free web service va Free Key Value yaratildi; pulli add-on yoqilmadi.
Amaldagi deploy commit: `864432355f385dd53561f9a9817e26b597a5078b`.

`npm.cmd run status` bulutdagi xizmatni tekshiradi. `start-beshball.cmd` bulutga
ko‘chirilganini bildiradi va lokal pollingni qayta yoqib webhookni buzmaydi.

## Faqat bepul xizmatlar

- Render: bitta Free web service va bitta Free Key Value (Redis).
- Supabase: Free loyiha, PostgreSQL va private rasm bucket.
- HTTPS va `*.onrender.com` manzilni Render beradi. Domen sotib olish shart emas.
- Render Postgres ishlatilmaydi: uning bepul bazasi 30 kunda tugaydi.
- Pul yechilmasligi uchun pulli tarif/add-onni yoqmang. Render akkauntida karta
  ulangan bo‘lsa, limitdan ortiq trafik uchun hisob chiqarishi mumkin; avval
  billingni tekshiring. Bu konfiguratsiya faqat `plan: free` resurslarini yaratadi.

Render 15 daqiqa kiruvchi trafik bo‘lmasa uxlaydi. Keyingi Telegram webhook
uni uyg‘otadi; javob taxminan bir daqiqa kechikishi mumkin. Shu vaqtda OCR va
rejalashtirilgan ishlar ham kutadi. Bu rejimda 24/7 uzluksizlik kafolati yo‘q.
Supabase Free: 500 MB baza, 1 GB rasm ombori; bir hafta faolsizlikda pauza.

## Ulanish uchun kerak bo‘ladigan ma’lumotlar

1. GitHubdagi BeshBall repository havolasi. Repository ildizida `render.yaml`
   bo‘lsin. `.env`, `.runtime`, eski `beshball/` nusxasi va lokal bazalarni yuklamang.
2. Supabase Free loyihasidan **Connect → Session pooler** PostgreSQL URL
   (5432-port), `?sslmode=require&connection_limit=3` bilan. Migratsiya uchun
   transaction pooler (6543-port) ishlatmang.
3. `STORAGE_PROVIDER=supabase`, `SUPABASE_STORAGE_URL=https://PROJECT_REF.supabase.co/storage/v1`
   va serverdagi `SUPABASE_SERVICE_KEY` orqali Storage REST API ishlatiladi.
   Kalit faqat Render Environment ichida turadi, brauzerga berilmaydi.
   S3 provayderini ham alohida S3 kalitlari bilan ishlatish mumkin.
   `beshball-receipts` bucket private bo‘lishi shart. Public Data API'ni
   o‘chirish tavsiya etiladi; cloud starter BeshBall jadvallarida RLSni ham yoqadi.
4. Render → New → Blueprint orqali repositoryni tanlang. `render.yaml` ikkala
   xizmatni ham faqat Free rejimda belgilaydi. Supabase va Telegram sirlarini
   Render Environment maydonlariga kiriting, repositoryga yozmang.
5. `BOT_API_SECRET` uchun mavjud lokal qiymatni saqlang: sessiya va idempotent
   natijalar shu kalit bilan shifrlangan. Yangi tasodifiy kalit eski ma’lumotni
   ocholmaydi. Bosh admin ID: `5916247309`.

## Ma’lumot va botni ko‘chirish tartibi

1. Cloud bot dastlab `TELEGRAM_SEND_ENABLED=false`: lokal polling bilan
   to‘qnashmaydi. `.env` lokal fayli o‘zgartirilmaydi.
2. Bulutdagi `/health`, `/ready`, admin sahifalari, Storage va ruxsatlarni tekshiring.
3. Lokal yozuvlarni vaqtincha to‘xtatib, PostgreSQL va receipt bucketni zaxiralang.
   Mavjud mijozlar, ball, xodimlar va rasmlarni yangi bazaga ko‘chiring; miqdorlar
   va balanslarni solishtiring. Bo‘sh baza bilan lokal hisoblarni almashtirmang.
4. Lokal botni to‘xtating. Renderda `TELEGRAM_SEND_ENABLED=true` qilib deploy qiling.
   Starter `ADMIN_URL` va `TELEGRAM_WEBHOOK_URL`ni Render HTTPS manzilidan oladi.
5. Telegram `/start` va `/admin` orqali tekshiring. Bosh admin chat menyusida
   «Admin panel» Mini App tugmasi avtomatik sozlanadi. Worker chek, ball va
   rezerv haqidagi xizmat xabarlarini yuboradi; reklama jo‘natmalari o‘chiq.
   Ball chekni admin tasdiqlaganidan keyin hisoblanadi.
6. Mavjud migratsiyalar, boshlang‘ich sozlama va RLS tayyor bo‘lsa, starter
   ularni har uyg‘onishda qayta bajarmaydi. Bepul Render uyqudan uyg‘onishi
   baribir qo‘shimcha vaqt olishi mumkin.

`Dockerfile.cloud` admin, backend, bot va OCRni bitta konteynerga yig‘adi.
Rasmlar va baza konteyner diskiga saqlanmaydi. Sirlar Docker buildga kirmaydi.

Manbalar: https://render.com/docs/free,
https://render.com/docs/blueprint-spec,
https://supabase.com/pricing,
https://supabase.com/docs/guides/database/prisma,
https://supabase.com/docs/guides/storage/s3/authentication.
