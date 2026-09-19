# BeshBall xavfsizligi va operatsion cheklovlar

## Amalga oshirilgan nazoratlar

- Telegram initData HMAC-SHA256 imzosi, takroriy maydonlar, user ID va auth_date tekshiriladi. Standart yoshi 1 soat, kelajakdagi vaqtga 30 soniya tolerans. Rol va active holati har so‘rovda bazadan olinadi; filial tekshiruvlari backendda.
- Bot xizmat siri kamida 32 belgi, customer resurslarida x-telegram-user-id egaligi tekshiriladi. Bu header faqat ishonchli bot xizmatidan qabul qilinadi. Bot siri ochilsa, uni almashtirish va sessiyalarni xavfsiz yangilash zarur.
- QR 32 tasodifiy bayt, zaxira kod crypto.randomInt. Reservation jadvalida hashlar; qayta javob va bot sessiyasidagi tokenlar BOT_API_SECRETdan hosil qilingan kalit bilan AES-256-GCM shifrlanadi. Sir almashtirilganda eski shifrlangan sessiyalar/idempotency javoblari o‘qilmaydi; migratsiya tartibini oldindan rejalashtiring.
- Zaxira kod 5 xato urinishdan keyin yopiladi; muvaffaqiyatsiz urinish tranzaksiyada saqlanadi. Kassir tasdig‘i alohida proof talab qiladi, skanerlash debit emas.
- Global rate limit 120 so‘rov/minut/IP. Reverse proxy orqali ko‘p mijoz bitta IP bo‘lib ko‘rinishi mumkin: ishonchli proxy topologiyasi sozlanmaguncha trustProxy=false. Ichki bot API tashqi tarmoqdan ajratilishi kerak.
- Zod runtime validation, Prisma parametrli so‘rovlari, React matn escapelashi, faqat HTTPS marketing havolalari, loglarda maxfiy headerlar redactioni va no-store/nosniff headerlari.
- Rasm turi, 8 MB hajm va 25 megapiksel limiti; yopiq S3 bucket. Rasmni ko‘rish endpointi xodim rolini/filialini tekshiradi va 60 soniyalik signed URL beradi. Signed URLni olgan odam shu qisqa vaqtda rasmni ko‘ra oladi; uni oshkor qilmang.
- Ledger/audit UPDATE va DELETE triggerlari bilan himoyalangan, tuzatish teskari yozuv orqali. Database owner bunday himoyani o‘zgartira oladi; production DB administrator huquqlarini alohida saqlang.
- Webhook secret va update_id unique. Lease va retry navbati. Biznes amallarida operation key va request hash bilan takroriy hisob yozuvi cheklanadi. Tarmoq xatosidan keyingi Telegram matni takrorlanishi mumkin.
- TELEGRAM_SEND_ENABLED=false haqiqiy yuborishni o‘chiradi. Testlar alohida beshball_test bazasini talab qiladi; ZIP ichida .env, test bazasi, node_modules va .runtime yo‘q.

## Shaxsiy ma’lumotlar

Telefon, ism, rozilik va xarid tarixi xizmat uchun saqlanadi; marketing roziligi alohida. Telefon/Telegram akkaunt bitta haqiqiy odamni to‘liq isbotlamaydi. Bot tug‘ilgan kunni o‘zgartirish/o‘chirish va shaxsiy ma’lumotlarni o‘chirish so‘rovini yuborishni qo‘llaydi. O‘chirish so‘rovi reklama obunasini ham to‘xtatadi.

Chek rasmi standart 365 kundan keyin worker orqali o‘chiriladi, OCR xom matni tozalanadi; tegishli iqtisodiy jurnal qoladi. Mijozni to‘liq o‘chirish avtomatik emas: bosh admin so‘rovni tekshiradi, qonuniy saqlash muddati tugagan profil/sessiya/outbox/backup nusxalarini belgilangan siyosat bilan anonimlashtiradi. Audit va ledger tarixini buzmaslik kerak. Anonimlashtirishning avtomatik admin amali ushbu versiyada mavjud emas.

Joylashtirishdan oldin mahalliy shaxsiy ma’lumot talablari, saqlash muddati, joylashuvi va rozilik matnini alohida huquqiy tekshirtiring. Ushbu loyiha qonunchilikka muvofiqlikni kafolatlamaydi.

## Tekshiruv chegarasi

ZimZim API ulanishi yo‘q; OCR savdo haqiqiyligi yoki chek egaligini isbotlamaydi. Vakolatli xodim haqiqiy savdoni qo‘lda tekshiradi. Hujjatlashtirilmagan endpoint, scraping yoki soxta POS tasdig‘i ishlatilmaydi.

Mahalliy testlarda initData test kaliti bilan imzolangan, Telegram tarmoq jo‘natmalari o‘chirilgan. Haqiqiy Telegram hisobidagi webhook, fizik telefon kamerasi, Docker build va avariya tiklash bu testlarning o‘rnini bosa olmaydi. Natijalar TEST_REPORT.md.

## Rasmiy manbalar

2026-09-12 kuni tekshirilgan Telegram manbalari:

- [Mini App initData tekshiruvi](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app): backendda initData tekshiriladi, client initDataUnsafega ishonilmaydi.
- [Mini App API](https://core.telegram.org/bots/webapps#initializing-mini-apps): kamera uchun showScanQrPopup, closeScanQrPopup va versiya imkoniyatlari.
- [Webhook API](https://core.telegram.org/bots/api#setwebhook): HTTPS webhook, secret_token; getUpdates bilan bir paytda ishlatilmaydi.
- [Telegram jo‘natish limitlari](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this): tezlik chegaralari va ortiqcha jo‘natishni cheklash. Worker konservativ navbat va retry_after bilan ishlaydi.
