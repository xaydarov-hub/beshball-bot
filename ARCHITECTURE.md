# BeshBall arxitekturasi

To‘rtta paket: shared (hisob va umumiy tiplar), backend (Fastify/Prisma API, worker), bot (grammY), admin (React/Vite/Tailwind Mini App). PostgreSQL asosiy manba, Redis/BullMQ ishlar navbati, S3/MinIO yopiq rasm ombori. Bazada UTC timestamptz, foydalanuvchiga Asia/Tashkent.

## Chek

Bot private xabar va o‘z contactini tekshiradi, backendga xizmat siri va Telegram ID bilan murojaat qiladi. JPEG/PNG/WebP 8 MB chegarada dekodlanadi. Global SHA-256 hash, yordamchi perceptual hash va birinchi qabul vaqti saqlanadi. Retry uchun mijoz+operatsiya kaliti natijani qaytaradi. Rasm S3ga, holat RECEIVED bazaga yoziladi. S3 va PostgreSQL taqsimlangan bitta tranzaksiya emas: S3 muvaffaqiyatidan keyin DB xatosi chiqsa yetim obyekt qolishi mumkin; backup/retention operatsiyalarida solishtirish kerak.

Worker 10 soniyada saqlangan RECEIVED/READING yozuvlarni BullMQga qo‘yadi. Tesseract natijasi schema bilan tekshiriladi; PENDING_REVIEWga o‘tadi. OCR urinishlari tugasa qo‘lda tekshirish navbatiga xato izohi bilan o‘tadi. Xodim ZimZim’da savdoni solishtiradi. approveReceipt bitta DB tranzaksiyada holat, base/bonus/referral ledger, lot, campaign usage, audit va outbox yozadi.

## Hisob va QR

core.atomic PostgreSQL advisory transaction lock orqali hisob/rezerv/limit o‘zgarishlarini ketma-ketlashtiradi. Bu kafe hajmi uchun sodda yechim; katta yukda bitta lock o‘tkazuvchanlikni cheklaydi. Ledger va audit UPDATE/DELETE trigger bilan bloklangan. Unique operationKey, sale identity va bitta ACTIVE rezerv indeksi qo‘shimcha himoya.

reserveGift mavjudlik, riskHold va balansni tekshiradi, eski rezervni bekor qiladi. QR token va zaxira kod kriptografik yaratiladi; reservation jadvalida hashlar saqlanadi. Takroriy javob va bot sessiyasi AES-GCM bilan shifrlangan. Kassir inspectReservation orqali niqoblangan profil va rezervga bog‘langan qisqa muddatli proof oladi. redeem proof, rol, filial, balans, muddat va limitni qayta tekshiradi; status, debit, lot sarfi, audit/outbox bir atomik amalda yoziladi.

## Telegram va worker

Polling faqat TELEGRAM_WEBHOOK_URL bo‘shligida. Webhook HTTP route secretni tekshirib TelegramUpdate unique ID bilan saqlaydi va tez javob beradi. Bot backend navbatidan 5 daqiqalik leaseToken bilan update oladi, grammY handleUpdatega uzatadi, muvaffaqiyatdan keyin done qiladi. Xatolar backoff bilan 8 marta uriniladi, keyin FAILED; bunday yozuvlarni operator kuzatib, sababni tuzatgach qayta navbatga qo‘yishi kerak. Eskirgan lease qayta olinadi. Biznes endpointlaridagi idempotensiya ballning qayta yozilishini cheklaydi; Telegram javob xabarlari tarmoq uzilishida takror ko‘rinishi mumkin.

Outbox biznes tranzaksiyasidan mustaqil yetkaziladi. Telegram 429 retry_after bajariladi, 403 doimiy blok sifatida saqlanadi. TELEGRAM_SEND_ENABLED=false haqiqiy jo‘natishni o‘chiradi. Telegram xabar yetkazishida tashqi idempotency kafolati yo‘q: send muvaffaqiyatidan keyingi DB uzilishi takror xabar keltirishi mumkin, ammo hisob operatsiyasini takrorlamaydi.

## Interfeys va ruxsatlar

auth/access.ts xodimning haqiqiy initData imzosi/yoshi, DB roli, active holati va filiallarini tekshiradi. Client roli/IDsi vakolat manbasi emas. Bot mijozga egalikni har customer endpointda tekshirtiradi. Admin /api orqali Vite yoki Nginx proxyga ulanadi. Dashboard, cheklar, mijozlar, sovg‘alar, aksiyalar, xabarlar, xodimlar/filiallar, audit/fikrlar va sozlamalar APIga ulangan. Telegram kamera API mavjud qurilmada showScanQrPopup; zaxira sifatida token yoki rezerv ID+kod mavjud.

ZimZim jonli API ulanishi mavjud emas. Docker build, haqiqiy Telegram webhook va telefon kamerasi ushbu mahalliy brauzer sinoviga kirmaydi. O‘lchangan natijalar TEST_REPORT.mdda.
