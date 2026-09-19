> TARIXIY TAHLIL: quyidagi topilmalar 2026-09-07 holatiga tegishli. Joriy tuzatish va sinov natijalari TEST_REPORT.md hamda README_UZ.md da. Eski topilmalarni joriy holat deb qabul qilmang.

# BeshBall — loyiha tahlili

Sana: 2026-09-07. Tahlil joriy katalogdagi kod va konfiguratsiyaga asoslangan.

## Umumiy baho

Loyiha Telegram orqali chek yuborish, xarid uchun ball yig'ish va sovg'a olish tizimining qisman amalga oshirilgan prototipi. Asosiy biznes matematikasi ajratilgan, ma'lumot modeli keng, botda backend chaqiruvlari bor. Lekin hozirgi holatida real mijozlar va ball hisobini boshqarish uchun tayyor emas: autentifikatsiya, hisobning yaxlitligi, ishga tushirish va asosiy admin oqimida to'siqlar mavjud.

Kodga tuzatish kiritilmadi. Ushbu hisobot qo'shildi. Haqiqiy Telegram botiga xabar yuborilmadi, ma'lumotlar bazasi o'zgartirilmadi, .env maxfiy qiymatlari ochilmadi.

## Tekshiruv doirasi va natijalari

- To'rtta paket, Prisma schema va seed, Docker/Compose, frontend, backend, bot, mavjud testlar, yordamchi skriptlar va loyiha hujjatlari ko'rildi.
- Muhit: Windows, Node v22.14.0. node_modules yo'q; tsx, tsc va Docker buyruqlari topilmadi.
- `npm.cmd run test:shared`: tsx topilmagani uchun bajarilmadi.
- `npm.cmd run typecheck`: barcha paketlarda tsc topilmagani uchun bajarilmadi.
- Mavjud testlar Node `stripTypeScriptTypes` orqali xotirada JavaScriptga aylantirilib ishga tushirildi. Har bir test o'z manba moduli bilan birlashtirildi, import bog'lanishi moslashtirildi; manba fayllari o'zgartirilmadi. Ball yadrosi 14/14, kampaniya yordamchilari 7/7, initData 4/4: jami 25/25 tekshiruv o'tdi.
- Bu usul npm paketlarining import/build sozlamalarini tekshirmaydi. Typecheck, production build, Prisma validation, haqiqiy DB tranzaksiyalari, HTTP integratsiya, OCR va frontend vizual sinovi bajarilmadi.
- Quyidagi tranzaksiya xavflari statik kod tahlili; real bazada parallel so'rov sinovi deb talqin qilinmasin.

## Arxitektura va funksional holat

| Qism | Koddagi holat | Amaliy cheklov |
|---|---|---|
| shared | Ball, bonus, multiplikator, kampaniya tanlash, referal va vaqt yordamchilari | Yordamchilarning bir qismi backendga ulanmagan |
| backend | Fastify route'lar, Prisma service'lar, initData va rollar | Mijoz API ochiq; hisob va start muammolari bor |
| bot | Ro'yxatdan o'tish, balans, chek, sovg'a rezervi, tarix, til, fikr uchun HTTP chaqiruvlari | Entry point noto'g'ri; referal to'liq emas; QR rasm yo'q |
| admin | Uch sahifa: dashboard, cheklar, kassir | Dashboard ulanmagan, chek ro'yxati doim bo'sh, kamera stub |
| OCR | Tesseract process va sodda matn parseri | Rasm doimiy saqlanmaydi; parser va resurs cheklovlari yetarli emas |
| POS | ZimZim interfeysi va NOT_CONFIGURED adapter | Haqiqiy savdo tekshiruvi yo'q |
| Infra | PostgreSQL, Redis, MinIO uchun Compose | Schema SQLite; Redis/MinIO amaliy oqimga ulanmagan |

## Eng muhim xavfsizlik va hisob muammolari

### 1. Kritik: mijoz API'larida autentifikatsiya va egalik tekshiruvi yo'q

Manba: `packages/backend/src/routes/customer.routes.ts:20`, `:57`, `:149`, `:168`; `packages/backend/src/server.ts:9`.

`/bot/*` nomi endpointni ichki qilmaydi. Global autentifikatsiya hook'i ham yo'q. Telegram ID orqali customerId olinadi; keyin begona mijoz balansini/tarixini ko'rish, uning nomidan chek yoki rezerv yaratish, faol rezervning zaxira kodini olish mumkin. `/bot/register` istalgan Telegram ID uchun ism/telefonni upsert qiladi va phoneVerified=true yozadi. Sovg'ani yakuniy berish kassir rolini talab qiladi, ammo rezerv tokeni va kodi mijoz autentifikatsiyasisiz olinadi.

Tuzatish: bot–backend uchun tekshiriladigan xizmat autentifikatsiyasi, mijoz identifikatorini ishonchli kontekstdan olish, har bir resursga egalik nazorati. Ochiq katalog javoblarida maydonlarni explicit tanlash: hozir `/gifts` ichki realCostSom'ni ham qaytaradi.

### 2. Kritik: approve → reject → approve bilan ball qayta yoziladi

Manba: `packages/backend/src/services/points.service.ts:69`; `packages/backend/src/routes/admin.routes.ts:85`.

Approve faqat APPROVED holatini rad etadi. Reject esa oldingi holatni tekshirmasdan REJECTED yozadi, oldin berilgan ballni qaytarmaydi. Shuning uchun ketma-ket approve, reject, approve bajarilsa bir chek uchun ikkinchi marta ball qo'shiladi. Bu holat parallel so'rovsiz ham mavjud.

Tuzatish: faqat ruxsat etilgan holat o'tishlari, shartli status update, tasdiqlangan chekni rad etish o'rniga alohida reversal amali, ledgerda tegishli noyob operatsiya kaliti.

### 3. Yuqori: parallel tasdiqlashga mustahkam kafolat yo'q

Manba: `packages/backend/src/services/points.service.ts:68`; `packages/backend/prisma/schema.prisma`, LedgerEntry.

Chek avval o'qiladi, keyin faqat id bo'yicha yangilanadi. Hujjatdagi PostgreSQL yo'liga o'tilganda ikki tranzaksiya bir xil PENDING holatini o'qib, ikkalasi ball yozishi mumkin. Oddiy transaction buning o'zini kafolatlamaydi; schema'da receipt va ledger turi bo'yicha unique himoya ham yo'q. SQLite'dagi aniq parallel xulq tekshirilmagan.

Tuzatish: expected-status update va count tekshiruvi, DB constraint, tanlangan bazada parallel HTTP/DB sinovlari.

### 4. Yuqori: rezerv balansni o'z tranzaksiyasidan tashqarida o'qiydi

Manba: `packages/backend/src/services/redemption.service.ts:38`; `packages/backend/src/services/points.service.ts:22`.

Eski rezerv tx ichida CANCELLED qilinadi, ammo getBalance asosiy Prisma client orqali ishlaydi. U hali commit bo'lmagan bekor qilishni ko'rmaydi. Masalan, 5 ball va 5 balllik eski rezerv bo'lsa, uni almashtirish yetarli ball bo'lishiga qaramay rad etilishi mumkin.

Bundan tashqari, customer bo'yicha serializatsiya va bitta ACTIVE rezerv uchun DB kafolati yo'q. PostgreSQL'da bir vaqtda yaratilgan ikki rezerv balansdan ortiq sarflashga olib kelishi mumkin; final redemption balansni qayta tekshirmaydi. Rezervdan keyingi manfiy manual adjustment/reversal ham mavjud qoldiqni yetarsiz qilib qo'yishi mumkin.

Tuzatish: balans va rezerv hisobini bir tx client bilan bajarish, customer darajasida raqobatni boshqarish, manfiy tuzatish va redeem uchun yagona hisob siyosati.

### 5. Yuqori: muddati o'tgan rezerv ballni band qilib turadi

Manba: `packages/backend/src/services/points.service.ts:30`; `packages/backend/src/services/redemption.service.ts:158`.

Balans faqat status=ACTIVE bo'yicha hisoblanadi, expiresAt tekshirilmaydi. expireStaleReservations bor, ammo uni chaqiradigan worker yo'q. 3 daqiqadan keyin QR ishlamaydi, lekin ball avtomatik bo'shamaydi. Faol rezervlar API'sida ham vaqt filtri yo'q.

Tuzatish: balans/ro'yxatga vaqt filtrini kiritish va muddati o'tgan holatlarni yangilaydigan rejalashtirilgan ish.

### 6. Yuqori: zaxira kod urinishlari cheklovi ishlamaydi

Manba: `packages/backend/src/services/redemption.service.ts:85`.

Noto'g'ri kodda attempts increment qilinadi va shu transaction ichida exception tashlanadi. Rollback incrementni ham bekor qiladi: 5 urinish chegarasi yig'ilmaydi. Kod Math.random orqali yaratiladi, ochiq saqlanadi; mijoz API'si uni autentifikatsiyasiz qaytaradi.

Tuzatish: muvaffaqiyatsiz urinishni commit qiladigan oqim, atomik attempt nazorati, kriptografik generator, kod hash'i va so'rov chastotasi cheklovi.

### 7. Yuqori: deaktivatsiya va filial ruxsatlari to'liq qo'llanmagan

Manba: `packages/backend/src/routes/cashier.routes.ts:19`, `:37`; `packages/backend/src/auth/roles.ts:22`.

Kassir route'lari staff.active'ni tekshirmaydi: o'chirilgan kassir haqiqiy initData bilan sovg'a berishi mumkin. assertBranchAccess yozilgan, lekin route'larda chaqirilmaydi. GiftBranch, dailyLimit va Customer.blocked ham xizmat mantig'ida nazorat qilinmaydi.

Tuzatish: markazlashgan staff autentifikatsiyasi, aktivlik va filial nazorati; sovg'a mavjudligi, kunlik limit va mijoz blokirovkasini reserve/redeem oqimiga kiritish.

### 8. Yuqori: chek rasmi saqlanmaydi va dublikat himoyasi zaif

Manba: `packages/backend/src/routes/customer.routes.ts:102`.

imageStorageKey faqat satr sifatida yaratiladi; S3/MinIO upload yo'q. OCR vaqtinchalik faylni yakunda o'chiradi. DB yozuvi mavjud bo'lsa ham original rasm omborda bo'lmaydi.

Hash tekshiruvi faqat customerId+imageHash uchun: aynan bir rasmni boshqa akkaunt yubora oladi. Tekshirish va create ajratilgan, hash uchun unique yo'q. Rasm o'zgartirilsa SHA-256 ham o'zgaradi. externalSaleId unique indeksiga kerakli qiymatni to'ldiradigan oqim yo'q.

Tuzatish: haqiqiy yopiq upload va signed read URL; tizim bo'yicha dublikat nazorati, atomik noyoblik, fiskal/POS identifikatori mavjud bo'lganda tekshiruv.

### 9. Yuqori: aksiya o'chirilgan bo'lsa ham bonus beriladi

Manba: `packages/backend/src/services/points.service.ts:73`; `packages/backend/prisma/seed.ts`.

Seed barcha aksiyalarni active=false yaratadi, lekin approve DB kampaniyalarini o'qimasdan DEFAULT_AMOUNT_TIERS'ni qo'llaydi. 80 000 so'm chek uchun barcha aksiyalar nofaol bo'lsa ham 10 000 bonus birlik beriladi. selectBestCampaign, muddat, budjet, usage limit va eligible tekshiruvlari approve oqimiga ulanmagan. Multiplikator/bonus xodim yuborgan qiymatdan olinadi.

Tuzatish: kampaniyani serverdagi faol konfiguratsiya va mijoz/xarid shartlari asosida aniqlash, qo'llangan kampaniya ID'si va limit sarfini tx ichida qayd qilish.

### 10. Yuqori: 120 daqiqalik qoida faqat yordamchi testda bor

Manba: `packages/shared/src/campaigns.ts:69`; `packages/backend/src/routes/customer.routes.ts`; `packages/backend/src/services/points.service.ts`.

isReceiptWithinAcceptanceWindow backendda chaqirilmaydi. OCR sanasi yoziladi, ammo receipt qabul qilish yoki approve vaqtida tekshirilmaydi. Shu sababli eski yoki kelajak sanali chekni biznes oqimi avtomatik rad etmaydi.

### 11. Yuqori: webhook kelgan xabarlarni qayta ishlamaydi

Manba: `packages/backend/src/routes/webhook.routes.ts`.

Route secretni tekshiradi, update ID'ni processed sifatida saqlaydi va 200 qaytaradi. grammY handlerga uzatish TODO. Webhook rejimida bot javob bermaydi; Telegram update yetkazildi deb hisoblaydi. Kelajakda handler ulanganda ham processed yozuvini ishlovdan oldin saqlash qayta urinishda xabar yo'qotish xavfini tug'diradi.

## Build va ishga tushirish to'siqlari

| Muammo | Dalil | Kerakli tuzatish |
|---|---|---|
| Baza konfiguratsiyasi mos emas | schema provider=sqlite, Compose va .env.example PostgreSQL | Bitta DB yo'lini tanlash; schema, URL, backup va deployni moslashtirish |
| Prisma sxemasi tekshirilmagan | Prisma 5.x ko'rsatilgan, SQLite schema enum/Json ishlatadi | O'rnatilgan aniq Prisma versiyasida validate/generate bilan tasdiqlash |
| Backend rootDir ziddiyati | tsconfig rootDir=src, include ichida prisma/seed.ts | Seed uchun alohida config yoki rootDir/include tuzatish |
| ESM importlar | NodeNext, lekin server/service/shared importlarida .js kengaytmasi yo'q | Node ESM'ga mos import va build chiqishi |
| Shared build yo'q | main=src/index.ts; build script va tsconfig yo'q | Shared'ni JS/declaration chiqaradigan paket qilish |
| dotenv e'lon qilinmagan | Backend va bot index.ts dotenv import qiladi, dependencies'da yo'q | Bog'liqlikni ochiq e'lon qilish |
| Bot noto'g'ri fayldan ishga tushiriladi | dev/start/Docker bot.ts yoki bot.js'ni ochadi; startBot'ni index.ts chaqiradi | Barcha start yo'llarini index entry pointga moslashtirish |
| Backend Docker listen sharti | CMD server.js; server faqat RUN_DIRECTLY=true bo'lganda listen qiladi; image/Compose bu qiymatni bermaydi | Yagona, shartsiz entry point |
| Windows script mos emas | RUN_DIRECTLY=true tsx/node ko'rinishidagi npm script | Platformaga mos env yuklash/start |
| Lockfile yo'q | Dockerfile npm ci chaqiradi | Lockfile yaratish va versionlarni qayta tiklanadigan qilish |
| Migratsiyalar yo'q | prisma/migrations katalogi yo'q, deploy migrate deploy | Tanlangan DB uchun tekshirilgan boshlang'ich migratsiya |
| Lokal va Docker env aralashgan | Namuna DB host=postgres, Redis host=redis | Host va container uchun alohida mos URL'lar |

Bu topilmalar konfiguratsiyadan aniqlangan. To'liq build bajarilib olingan compiler xatolari deb ko'rsatilmayapti.

## Frontend va foydalanuvchi oqimi

1. `ReceiptsQueue.tsx:14`: rows doim []; GET endpoint va yuklash yo'q. Oddiy admin chekni ko'rib tasdiqlay olmaydi. Rasm ko'rsatish elementi ham yo'q.
2. `Dashboard.tsx:22`: faqat endpoint ulanmagan degan xabar; real statistika kelmaydi.
3. `CashierScanner.tsx:40`: kamera tugmasi alert ko'rsatadi. Zaxira kod kiritish UI'si yo'q. Bot QR rasmini emas, token matnini beradi; Faol QR menyusi faqat zaxira kodni ko'rsatadi, backendga kerakli reservationId foydalanuvchiga chiqarilmaydi.
4. `api.ts:12`: default API URL localhost. Admin Docker build root .env/VITE_BACKEND_URL'ni uzatmaydi; telefonda localhost server emas, telefonni bildiradi.
5. Frontend va API alohida originlarda, lekin backendda CORS yoki frontendda API proxy sozlanmagan. Brauzer so'rovlari uchun transport konfiguratsiyasi tugallanmagan.
6. Tailwind direktivalari bor, ammo PostCSS/Tailwind ulanish konfiguratsiyasi yo'q. Utility classlar uchun CSS generatsiyasi build bilan tekshirilishi va ulanishi kerak.
7. BrowserRouter ishlatiladi; Nginx uchun SPA fallback yo'q. Ichki `/cheklar` va `/kassir` URL'lariga to'g'ridan-to'g'ri kirish/reload uchun konfiguratsiya kerak.
8. Har urinishda yangi idempotencyKey yaratiladi. Javob yo'qolgandan keyingi retry avvalgi operatsiyaning natijasini ishonchli qaytarmaydi.
9. Frontendda foydalanuvchi roli va ruxsat etilgan navigatsiyani yuklash yo'q; barcha uch menyu ko'rinadi.

## Bot va biznes matnlari

- `bot.ts:313`: foydalanuvchiga 10 000 so'm = 1 ball deyiladi. Engine va BUSINESS_RULES 100 000 so'm = 1 ball deydi. Matn 10 baravar noto'g'ri va ikki tilda takrorlangan.
- `bot.ts:617`: referal havola yaratiladi va ikkala kishiga bonus va'da qilinadi. /start payload parse qilinmaydi; referrer DB'ga bog'lanmaydi, referal mukofoti yozilmaydi.
- Fikr yuborish xato bersa ham “qabul qilindi” deyiladi; adminga to'g'ridan-to'g'ri yetkazish kodi yo'q, faqat Feedback jadvaliga yozish endpointi bor.
- Sessiya xotirada; restartdan keyin davom etayotgan ro'yxatdan o'tish yo'qoladi. Mavjud mijoz /start bilan DB'dan tiklanadi, shuning uchun barcha mijoz yozuvlari yo'qoladi degan xulosa noto'g'ri bo'ladi.
- Ism/katalog matni Markdown'ga escape qilinmaydi; maxsus belgilar Telegram format xatosiga olib kelishi mumkin.
- API so'rovlari uchun aniq timeout va umumiy bot.catch yo'q; qayta tiklanish va xatoni qayd etish oqimi tugallanmagan.

## Qo'shimcha kod, audit va ekspluatatsiya masalalari

- Request body'lari as type bilan cast qilinadi; bu runtime validation emas. Summa chegarasi, format, ID, limit va string uzunligi uchun server schema kerak.
- Rasm endpointi 8 MB deydi, Fastify'da shunga mos bodyLimit sozlanmagan; base64 ham payloadni kattalashtiradi. Katta telefon rasmlari route tekshiruviga yetmasdan rad etilishi mumkin. Aniq chegara HTTP sinovida tasdiqlansin.
- OCR har so'rovda process ochadi, timeout/concurrency limiti yo'q; autentifikatsiya va rate limit yo'qligi bilan resurslarni tugatish xavfi kuchayadi.
- OCR parser `32 000.00` ni `3200000` qiladi. Sana server lokal timezone'ida yaratiladi; konteyner va Asia/Tashkent orasida vaqt siljishi mumkin. confidencePercent haqiqiy OCR confidence emas, 55/20 evristik qiymat.
- InitData auth_date uchun finite/integer va kelajakdagi vaqt nazorati yo'q; hash tengligi timingSafeEqual bilan qilinmagan. Bu o'z-o'zidan imzosiz kirish borligini anglatmaydi.
- Audit yozuvlari approve/manual adjustment tranzaksiyasidan keyin alohida yoziladi. Audit ishlamasa, amal allaqachon bajarilgan bo'lsa ham API xato qaytaradi. Manual adjustment retry qilinsa ikkinchi marta yozilishi mumkin.
- reverseReceipt barcha tegishli yozuvlarni, oldingi reversallarni ham o'qiydi; parallel/repeated reversal uchun aniq guard yo'q. Alohida idempotent reversal va audit kerak. Ketma-ket takroriy reversal har doim qayta pul yechadi deb bo'lmaydi: mavjud yozuvlar jami nol bo'lishi mumkin, ammo keraksiz juft yozuvlar ko'payadi.
- IdempotencyKey faqat global key saqlaydi: actor, operation, request hash va javob yo'q. Backup-code yo'li avvalgi key'ni tekshirmaydi. Natijani qayta tiklash xulqi ikki yo'lda turlicha.
- Ledger append-only ekani izoh va xizmat konvensiyasi bilan ifodalangan; DB huquqlari/triggers bilan o'zgartirishni taqiqlash yo'q.
- Number.isInteger safe integer chegarasini kafolatlamaydi; ko'paytma va DB Int diapazoni uchun limitlar yo'q. Oddiy qiymatdagi testlar katta son aniqligini qamramaydi.
- Seed qayta ishlatilganda sovg'a narxlarini namunaga qaytaradi va kampaniyalarni o'chiradi. Admin qo'shish uchun seedni qayta ishlatish haqidagi README amaldagi sozlamalarni o'zgartirishi mumkin.
- Compose DB/Redis/MinIO portlarini hostga chiqaradi; Redis auth yo'q, DB/MinIO parollari namunaviy qattiq qiymatlar. Bu konfiguratsiyani production sifatida ishlatishdan oldin ichki tarmoq va secret sozlamalari kerak.
- Backup MinIO bosqichi xatosini yutadi va yakunda “tayyor” deydi. Restore mavjud bazani tozalamaydi, plain pg_dump'ni ustiga yuklaydi; psql ON_ERROR_STOP yo'q. Takror obyekt/ma'lumot xatolari bo'lsa ham muvaffaqiyat taassuroti paydo bo'lishi mumkin.
- Caddy namunasi Docker service nomlariga murojaat qiladi, lekin Compose'da Caddy yo'q. Hostda ishga tushirilsa mos host portlari, containerda bo'lsa shu Docker tarmog'i kerak.
- /health faqat ok=true qaytaradi; DB readiness tekshiruvi yo'q. CI, lint config, integratsion/E2E testlar va ishlab chiqarish monitoringi mavjud emas.

## Hujjatlar bilan kod orasidagi farqlar

- README va ARCHITECTURE bot integratsiyasini skelet deydi, ammo joriy botda ko'plab backend chaqiruvlari yozilgan.
- ARCHITECTURE rasm MinIO'ga yuklanishi va webhook grammY'ga uzatilishini oqim sifatida ko'rsatadi; kodda ikkalasi ham bajarilmaydi.
- PostgreSQL deb yozilgan schema amalda SQLite provider ishlatadi.
- SECURITY'dagi rate limiting “amalga oshirilgan” bo'limida turadi, lekin o'z matnida ham ulanmagan deb yozilgan; kodda yo'q.
- TEST_REPORT'dagi 25 birlik tekshiruvi soni qayta tasdiqlandi. Ammo “npm run test:shared yuqoridagi 25 testni qayta tasdiqlaydi” noto'g'ri: bu script faqat shared'dagi 21 tekshiruvni ishga tushiradi, backend'dagi 4 test alohida.
- Unit testlar moliyaviy tranzaksiyalar, dublikatlar yoki ruxsatlar to'liq xavfsiz ekanini isbotlamaydi.

## Kuchli tomonlar

- Hisob formulasi alohida, sodda modulda; oddiy qiymatlar bo'yicha 25 tekshiruv o'tdi.
- Balans ledger yig'indisidan hisoblanadi; sabab va bog'liq chek/rezervni saqlash uchun model bor.
- Admin rollari client yuborgan roldan emas, bazadan olinadi.
- QR token kriptografik randomBytes orqali yaratiladi va asosiy token hash sifatida saqlanadi.
- Aynan bitta rezervni redeem qilishda status va expiresAt bo'yicha shartli update bor; bu foydali himoya, ammo barcha balans raqobatini hal qilmaydi.
- OCR avtomatik tasdiqlamaydi; ZimZim adapteri soxta muvaffaqiyat qaytarmaydi.
- Botda o'z kontaktini tekshirish, rozilik bosqichi va ikki til mavjud.

## Tuzatish tartibi va qabul mezonlari

1. **Ishga tushirish asosini tiklash:** DB tanlovi, dependency/lockfile, tsconfig/ESM/shared build, yagona entry point, migratsiya va env. Mezon: toza checkout'da install → generate → typecheck → build → migrate → start muvaffaqiyatli.
2. **Mijoz va xodim ruxsatlari:** xizmat autentifikatsiyasi, ownership, active, branch, blocked, validation va rate limit. Mezon: autentifikatsiyasiz yoki begona resurs so'rovi rad qilinadi; inactive/foreign-branch staff amal bajarmaydi.
3. **Hisob yaxlitligi:** receipt state machine, tx client, parallel reserve/approve, reversal, idempotency, expiry, dailyLimit. Mezon: parallel va retry so'rovlarda bir amal bir marta yoziladi, mavjud bo'lmagan ball sarflanmaydi.
4. **Chekni to'liq ko'rib chiqish:** upload, signed URL, ro'yxat/detail, sana/dublikat/POS-manual identifikatori, approve/reject va foydalanuvchiga natija. Mezon: yuborilgan original rasm admin tomonidan ko'riladi va holat bilan mos ledger hosil bo'ladi.
5. **Frontend va botni yakunlash:** API routing, Tailwind, SPA fallback, QR rasm/kamera/zaxira kod, dashboard, rol UI, 100 000 so'm matni, haqiqiy xato xabarlari. Mezon: telefonda ro'yxatdan o'tish → chek → tasdiq → balans → sovg'a oqimi bajariladi.
6. **Qo'shimcha biznes va ekspluatatsiya:** faol kampaniya, referal, marketing roziligi/broadcast, backup-restore, monitoring, CI va hujjatlarni moslashtirish. Mezon: qayta tiklangan bazada hisob va rasmlar bir-biriga mos; biznes limitlar avtomatik testda tasdiqlangan.

Real ishlatishga o'tish uchun eng muhim shart: faqat matematik birlik testlarini emas, haqiqiy tanlangan bazada tranzaksiya va API ruxsatlari sinovlarini ham o'tkazish.

