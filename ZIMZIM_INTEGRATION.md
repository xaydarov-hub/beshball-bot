# ZIMZIM_INTEGRATION.md

## Joriy holat: **NOT_CONFIGURED**

Loyiha yaratilgan vaqtda ZimZim POS tizimi uchun rasmiy API hujjati va
kirish ma'lumotlari (API key, endpoint) berilmagan. Shu sababli:

- `packages/backend/src/adapters/pos/zimzim.adapter.ts` hech qanday
  haqiqiy tarmoq so'rovi yubormaydi.
- `getStatus()` har doim `"NOT_CONFIGURED"` qaytaradi.
- `findSaleByExternalId()` chaqirilsa, aniq xato tashlaydi — hech qachon
  o'ylab topilgan yoki soxta savdo yozuvi qaytarmaydi.
- Barcha chek tekshiruvi **qo'lda (manual verification)** rejimida ishlaydi:
  xodim chekni ko'rib, ZimZim'da (alohida, tashqi tizimda) qo'lda
  solishtirib, keyin tasdiqlaydi.

## Kelajakda integratsiya uchun kerakli maydonlar

`PosSaleRecord` interfeysi (`packages/shared/src/types.ts`) allaqachon shu
maydonlarni ko'zda tutadi:

| Maydon | Tavsif |
|---|---|
| `externalSaleId` | Noyob savdo ID (ZimZim tomonidan berilgan) |
| `branchOrTillId` | Filial/kassa identifikatori |
| `paidAtIso` | To'langan aniq vaqt (ISO 8601) |
| `amountSom` | Haqiqiy to'langan summa |
| `lineItems` | Mahsulotlar va narxlari (ixtiyoriy) |
| `discountsSom` | Chegirmalar summasi (ixtiyoriy) |
| `refunded` | Qaytarish/bekor qilish holati |
| `linkedCustomerExternalId` | Agar ZimZim mijoz ID sifatida biror narsani bilsa |

## Ulash yo'riqnomasi (hujjat va ruxsat kelganda)

1. `.env` ga `ZIMZIM_API_BASE_URL` va `ZIMZIM_API_KEY` qo'shiladi (allaqachon
   `.env.example` da joy tayyorlangan, bo'sh holda).
2. `ZimZimPosAdapter.getStatus()` — agar ikkala env o'zgaruvchi to'ldirilgan
   bo'lsa va bir marta test-so'rov muvaffaqiyatli o'tsa, `"CONFIGURED_LIVE"`
   qaytaradigan qilib yangilanadi.
3. `findSaleByExternalId()` ichida haqiqiy HTTP so'rov yoziladi (rasmiy
   hujjatdagi endpoint, autentifikatsiya usuli asosida — hozircha noma'lum).
4. `PosAdapterConfig.status` bazada `CONFIGURED_LIVE` ga yangilanadi.
5. Faqat shundan keyin — va aniq admin qarori bilan — chek tasdiqlash
   oqimiga avtomatik ZimZim solishtiruvi qo'shiladi. **Oddiy QR-kodning
   o'zi ishonchli manba emas** (spetsifikatsiya talabi) — solishtiruv
   noyob savdo ID + filial/kassa + summa + vaqt kombinatsiyasi bilan
   bo'lishi kerak.

## Ikki soatlik qoida va dublikat himoyasi bilan bog'liqlik

ZimZim ulanmaguncha, ikki soatlik chek qabul qilish oynasi va rasm-hash
dublikat tekshiruvi **yagona** himoya chizig'i hisoblanadi. Bu boshqa
odamning hali ishlatilmagan chekini butunlay to'xtata olmaydi (masalan,
ikkita turli mijoz tasodifan bir xil summa va vaqtga ega, lekin haqiqatda
turli cheklarni yuborsa) — bu SECURITY.md va BUSINESS_RULES.md da ham
qayd etilgan, chunki spetsifikatsiya buni aniq hujjatlashtirishni talab
qiladi.
