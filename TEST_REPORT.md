# BeshBall — tekshiruv va tuzatish hisoboti

## 2026-09-14 — admin tugmasi, chek xabarlari va tezlik

- Render Free deploy: `baf5e1e7de20fd3f7721787f9df53c5e8d1f2687`; jonli tekshiruv: 2026-09-14T05:01:02.843Z.
- Bosh admin chat menyusidagi «Admin panel» HTTPS Mini App tugmasi Telegram API orqali tekshirildi. `/admin` sessiya bazasi ishlamasa ham ochish tugmasini beradi.
- Filialdan oldin kelgan chek rasmi sessiyada saqlanadi; yagona filial avtomatik tanlanadi.
- Chek/ball/rezerv xabarlari yoqildi. Navbatdagi 1 xizmat xabari SENT bo‘ldi; reklama yuborilmadi. Mavjud 3 chek PENDING_REVIEW: ball faqat haqiqiy savdo admin tomonidan tasdiqlangach yoziladi.
- Jonli bo‘sh navbat so‘rovlari oldin 1446–2313 ms, yangilanishdan keyin 287–580 ms. Bu alohida API o‘lchovi; to‘liq Telegram javobi va bepul server uyg‘onish vaqti emas.
- Typecheck/build/lint, 19 unit test guruhi va 21 PostgreSQL integratsion test o‘tdi. GitHub CI run 34807899937 muvaffaqiyatli.
- Jonli HTTP, admin imzosi/ruxsati, 3 private chek rasmi, xabarsiz webhook sinovi va 12 admin sahifasi mobil/desktop tekshiruvdan o‘tdi.
- Bepul Render uyquga ketishi mumkin. ZimZim API ulanmagan; OCR o‘zi chekni tasdiqlamaydi.


## 2026-09-13 — tiklash va botni ishga tushirish

- Eski prototip bilan aralashgan fayllar mavjud ZIPdagi to‘liq koddan tiklandi.
  Oldingi fayllar va .env `.runtime/source-backup-20260913-124349`ga zaxiralandi.
- Foydalanilmaydigan uchta eski admin sahifasi zaxiralandi va olib tashlandi.
- .env lokal PostgreSQL 55432, Redis 56379, MinIO 59000 va bot/backend siri bilan
  moslashtirildi; mavjud Telegram tokeni saqlandi.
- `npm.cmd start`, `npm.cmd status` va `start-beshball.cmd` qo‘shildi.
- Typecheck, lint va barcha paketlarning buildi o‘tdi.
- `npm test`: 14/14 test guruhi. Yangi test kontakt egasi, ro‘yxatdan o‘tish,
  roziliklar va sessiya yo‘qolgach menyuni tiklashni qamraydi.
- Integratsion testlar: 19/19, alohida beshball_test bazasida.
- E2E: yopiq rasm ombori, signed URL, haqiqiy OCR/BullMQ, 12 admin bo‘limi,
  mobil/desktop UI, chek tasdiqlash va QR orqali ballni bir marta yechish o‘tdi.
- Haqiqiy @beshball_bot polling rejimida ishga tushdi.
- Hali sozlanmagan: bosh admin Telegram ID va HTTPS Mini App manzili.
  ZimZim API ulanmagan; chekni xodim tekshiradi. Lokal launcher navbatdagi
  avtomatik jo‘natmalarni yoqmaydi. Kompyuter o‘chiq bo‘lsa bot ishlamaydi.

Quyidagi bo‘limlar oldingi tekshiruv tarixidir.

Sana: 2026-09-12. Muhit: Windows, Node.js 22.14, PostgreSQL (lokal 55432), Redis (56379), MinIO (59000), Chrome headless va haqiqiy Tesseract WebAssembly. Barcha sun’iy sinov yozuvlari alohida beshball_test bazasida; haqiqiy Telegram xabari yuborilmadi va ommaga deploy qilinmadi.

## Tuzatilgan muammolar

1. Shared TypeScript builddagi rootDir/test ziddiyati bartaraf etildi. Testlar build chiqishidan ajratildi; barcha eski va yangi testlar npm testga kiritildi.
2. Balans kartasi qisman yig‘ilgan birliklarni hisobga oladi: 265 000 birlikdan 7 ballik sovg‘agacha 435 000 so‘m. Karta admin tahrirlagan haqiqiy katalogdan foydalanadi; menyu narxi va talab qilingan xarid summasi ajratildi; band ball ko‘rsatiladi; manfiy balans xato bermaydi.
3. Kartadagi sovg‘a, referal va tarix tugmalari handlerlarga ulandi. Referal ID va bot username manbasi to‘g‘rilandi; ruscha matnlar va balans tasviri tuzatildi.
4. Chek upload retry birinchi natijani qaytaradi, qayta chek yaratmaydi. Dublikat va filial tekshiruvi upload bilan idempotent amalda bajariladi.
5. Noto‘g‘ri rasm 400 bilan rad etiladi. Shaffof rasmlarning perceptual hash kanallari to‘g‘rilandi. OCR noto‘g‘ri kalendar sanalarini o‘tkazmaydi; summa saqlanadi. OCR timeoutdan keyin kech yaratilgan worker yopiladi.
6. Webhook update navbatiga atomik lease, backoff, eskirgan lease qaytarilishi va 8 urinishdan keyingi FAILED holati qo‘shildi. Bot vaqtinchalik API xatosida butunlay to‘xtab qolmaydi.
7. Telegram 403 oluvchiga keyingi jo‘natmalarni to‘xtatadi. Yangi private murojaatda xizmat jo‘natmalari tiklanadi, reklama obunasi o‘z-o‘zidan qaytmaydi.
8. Tug‘ilgan kunni tahrirlash va o‘chirish bot sozlamalariga ulandi. /start eski forma holatini tozalaydi; rasm-fayl sifatida yuborilgan JPG/PNG/WebP cheklar qabul qilinadi; bo‘sh katalog javobi qo‘shildi.
9. Shared hisoblashda multiplikator va bonus birga qo‘shilishi olib tashlandi: eng foydali bittasi. Bir mijoz qarzi boshqa mijozlarga tegishli sovg‘a majburiyatini kamaytirmaydi.
10. Admin filial formasi accessibility nomi, API timeout, mijozlar sahifalashi va savdo/kassa ID chetidagi bo‘shliqlar tuzatildi.
11. Qo‘shimcha DB migratsiyasi test va mavjud lokal bazaga qo‘llandi. Eski .envdagi noto‘g‘ri lokal portlar ishlayotgan xizmatlarga moslandi; Telegram tokenlari saqlandi. API serveri qayta ishga tushirildi.
12. README, arxitektura, biznes qoidalari va xavfsizlik hujjatlaridagi eski prototip ta’riflari yangilandi. Eski PROJECT_ANALYSIS_UZ.md tarixiy hisobot sifatida belgilandi.

## Amalda bajarilgan tekshiruvlar

| Tekshiruv | Natija |
|---|---|
| Prisma generate | O‘tdi; Prisma client 6.19.3 |
| PostgreSQL migrations | 4 migratsiya; yangi delivery_recovery qo‘llandi |
| npm run typecheck | To‘rtta paket o‘tdi |
| npm run build | Shared, backend, bot va React/Vite admin yig‘ildi |
| npm test | Node test runner 13/13 test guruhi o‘tdi; legacy fayllar ichida qo‘shimcha 34 assertion bor |
| npm run test:integration | Haqiqiy PostgreSQL bilan 19/19 o‘tdi |
| npm run lint | Xato va ogohlantirishsiz |
| npm audit | 0 ma’lum zaiflik (joriy registry natijasi; mutlaq xavfsizlik kafolati emas) |
| E2E upload | Haqiqiy S3 upload, bir xil retry bitta receipt, anonim o‘qish 403, signed URL 200 |
| E2E OCR | Redis + BullMQ + haqiqiy Tesseract 32 000.00 ni 32 000 o‘qidi; PENDING_REVIEW |
| E2E admin/kassir | UI orqali chek tasdiqlash; inspect balansni o‘zgartirmaydi; confirm 7 ballni bir marta yechadi |
| E2E sahifalar | Barcha 12 admin bo‘limi imzolangan test initData bilan haqiqiy APIga ulandi |
| E2E ekranlar | 390 px mobil va 1440 px desktop; mobil sahifa tashqarisiga gorizontal chiqish yo‘q; JavaScript pageerror yo‘q |

Integratsion sinovlar parallel QR tasdiqlash, rezerv almashtirish, qaytarish, muddat, dublikat, mavjudlik/limit, kassir/filial ruxsati, 5 urinishli zaxira kod, autentifikatsiya, marketing, karta hisobi, webhook lease/retry, bloklangan oluvchi va qarzdorlikni qamradi.

Vizual tekshiruv rasmlari lokal artifacts katalogida: dashboard-mobile.png, dashboard-desktop.png, receipt-mobile.png, cashier-mobile.png. Ular sinov ma’lumotlari bilan olingan va ZIPga kiritilmaydi.

## Chegaralar va qolgan tashqi ishlar

- ZimZim jonli API hujjati/kirishi yo‘q. NOT_CONFIGURED saqlanadi; ishlab turgan yo‘l — xodimning haqiqiy savdoni qo‘lda tekshirishi.
- Haqiqiy Telegram hisobida ro‘yxatdan o‘tish, jonli webhook jo‘natmalari va fizik kamera sinovdan o‘tkazilmadi. Bot unit sinovlari grammY handlerlarini soxta tarmoq adapterida ishlatadi; haqiqiy foydalanuvchilarga xabar yubormaydi.
- Native Tesseract Docker yo‘li, Docker image build, backup/restore avariya mashqi bajarilmadi. Windows WASM OCR yo‘li haqiqatan sinovdan o‘tdi.
- Mijoz ma’lumotini to‘liq anonimlashtirish operator jarayoni; avtomatik admin amali emas. Mahalliy huquqiy talablar deploymentdan oldin alohida tekshiriladi.
- Hisobotda ishonchsiz OCR qatorlaridan mahsulot sotuvini yoki aksiya yaratgan qo‘shimcha savdoni hisoblash yo‘q. Xabar yuborish o‘qilganlik sifatida ko‘rsatilmaydi; tashqi URL tugmasi click analytics bu versiyada ulanmagan.
- Sinovdan o‘tgan oqimlar barcha mumkin bo‘lgan yuk, qurilma, tarmoq va tashqi xizmat xatosi yo‘qligiga kafolat bermaydi. Ishlab chiqarish monitoringi, zaxirani tiklash va haqiqiy Telegram qabul sinovi operatorning navbatdagi tekshiruvlari.

ZIP: loyiha ildizidagi beshball.zip. .env, .runtime, node_modules, baza/chek fayllari va boshqa maxfiy lokal ma’lumotlar kiritilmaydi.
