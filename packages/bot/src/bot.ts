import {
  Bot,
  session,
  Keyboard,
  InlineKeyboard,
  InputFile,
  type Context,
  type SessionFlavor,
} from "grammy";
import { AsyncLocalStorage } from "node:async_hooks";
import QRCode from "qrcode";
interface State {
  locale: "uz" | "ru";
  step?: "contact" | "name" | "consent" | "marketing" | "birthday";
  phone?: string;
  name?: string;
  customerId?: string;
  referrer?: string;
  marketing?: boolean;
  editingBirthday?: boolean;
  feedback?: boolean;
  branchId?: string;
  pendingReceiptFileId?: string;
  reservation?: {
    reservationId: string;
    qrToken: string;
    backupCode: string;
    expiresAt: string;
  };
}
type Ctx = Context & SessionFlavor<State>;
const scope = new AsyncLocalStorage<{
  telegramId: string;
  updateId: number;
  sessionJson?: string;
}>();
const base = process.env.BACKEND_URL ?? "http://localhost:3000";
const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
export const bot = new Bot<Ctx>(token);
export async function api<T = any>(
  method: string,
  path: string,
  body?: any,
): Promise<T> {
  const ctx = scope.getStore();
  const payload =
    body && method === "POST"
      ? {
          ...body,
          idempotencyKey:
            body.idempotencyKey ??
            `tg-${ctx?.updateId ?? Date.now()}-${path.split("/").at(-1)}`,
        }
      : body;
  const res = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-bot-secret": process.env.BOT_API_SECRET ?? "",
      "x-telegram-user-id": ctx?.telegramId ?? "",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.error ?? "API xatosi");
  return data as T;
}
bot.use(async (ctx, next) => {
  if (!ctx.from || ctx.chat?.type !== "private") return;
  await scope.run(
    { telegramId: String(ctx.from.id), updateId: ctx.update.update_id },
    next,
  );
});
// Admin access must remain available during registration and even if session
// storage is slow. The web app itself still checks signed Telegram staff auth.
async function openAdmin(c: Context) {
  if (process.env.ADMIN_URL?.startsWith("https://"))
    await c.reply("BeshBall boshqaruvi", {
      reply_markup: new InlineKeyboard().webApp(
        "Admin panelni ochish",
        process.env.ADMIN_URL,
      ),
    });
  else await c.reply("Admin panel manzili hali sozlanmagan.");
}
bot.command("admin", openAdmin);
bot.hears(["🛠 Admin panel", "Admin panel"], openAdmin);
bot.use(
  session({
    initial: (): State => ({ locale: "uz" }),
    getSessionKey: (ctx) => String(ctx.from!.id),
    storage: {
      read: async (k) => {
        const value = (await api("GET", `/bot/sessions/${k}`)) ?? undefined;
        const current = scope.getStore();
        if (current) current.sessionJson = JSON.stringify(value);
        return value;
      },
      write: async (k, v) => {
        if (scope.getStore()?.sessionJson === JSON.stringify(v)) return;
        await api("PUT", `/bot/sessions/${k}`, v);
      },
      delete: async (k) => {
        await api("PUT", `/bot/sessions/${k}`, { locale: "uz" });
      },
    },
  }),
);
const t = (c: Ctx, uz: string, ru: string) => {
  // Session storage can fail before middleware has initialized ctx.session.
  try {
    return c.session.locale === "ru" ? ru : uz;
  } catch {
    return c.from?.language_code === "ru" ? ru : uz;
  }
};
function menu(c: Ctx) {
  const keyboard = new Keyboard()
    .text(t(c, "💰 BeshBallarim", "💰 Мои BeshBall"))
    .text(t(c, "📷 Chek yuborish", "📷 Отправить чек"))
    .row()
    .text(t(c, "🎁 Sovg‘alar", "🎁 Подарки"))
    .text(t(c, "📱 Faol QR", "📱 Активный QR"))
    .row()
    .text(t(c, "🎉 Aksiyalar", "🎉 Акции"))
    .text(t(c, "👥 Do‘st taklif qilish", "👥 Пригласить друга"))
    .row()
    .text(t(c, "📋 Tarix", "📋 История"))
    .text(t(c, "💬 Fikr va yordam", "💬 Отзыв и помощь"))
    .row()
    .text(t(c, "⚙️ Sozlamalar", "⚙️ Настройки"))
    .resized();
  if (
    (process.env.SUPER_ADMIN_TELEGRAM_IDS ?? "")
      .split(",")
      .map((x) => x.trim())
      .includes(String(c.from?.id)) &&
    process.env.ADMIN_URL?.startsWith("https://")
  )
    keyboard.row().webApp("🛠 Admin panel", process.env.ADMIN_URL);
  return keyboard;
}
async function ready(c: Ctx) {
  if (c.session.customerId) return true;
  await c.reply(
    t(
      c,
      "Avval /start orqali ro‘yxatdan o‘ting.",
      "Сначала зарегистрируйтесь: /start",
    ),
  );
  return false;
}
async function branches(c: Ctx, action: string) {
  const list = await api<any[]>("GET", "/branches");
  const kb = new InlineKeyboard();
  for (const b of list) kb.text(b.name, `branch:${action}:${b.id}`).row();
  await c.reply(t(c, "Filialni tanlang:", "Выберите филиал:"), {
    reply_markup: kb,
  });
}
async function finish(c: Ctx, birthday?: string) {
  const s = c.session;
  const r = await api("POST", "/bot/register", {
    telegramUserId: c.from!.id,
    phoneE164: s.phone,
    fullName: s.name,
    locale: s.locale,
    dataConsentAt: new Date().toISOString(),
    marketingConsent: s.marketing ?? false,
    birthDayMonth: birthday,
    referrerTelegramId: s.referrer,
  });
  s.customerId = r.customerId;
  s.step = undefined;
  delete s.phone;
  delete s.name;
  await c.reply(
    t(
      c,
      "Ro‘yxatdan o‘tdingiz. Chek yuboring va ball to‘plang!",
      "Регистрация завершена. Отправляйте чеки и копите баллы!",
    ),
    { reply_markup: menu(c) },
  );
}
bot.command("start", async (c) => {
  const ref = String(c.match ?? "").match(/^ref_(\d+)$/);
  if (ref && ref[1] !== String(c.from!.id)) c.session.referrer = ref[1];
  try {
    const r = await api("GET", `/bot/customers/by-telegram/${c.from!.id}`);
    c.session.customerId = r.customerId;
    c.session.locale = r.locale;
    c.session.step = undefined;
    c.session.feedback = false;
    c.session.editingBirthday = false;
    await c.reply(
      t(
        c,
        "BeshBall — Besh Bola Lavash. Xush kelibsiz!",
        "BeshBall — Besh Bola Lavash. Добро пожаловать!",
      ),
      { reply_markup: menu(c) },
    );
    return;
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "Mijoz topilmadi") throw e;
  }
  await c.reply("Tilni tanlang / Выберите язык", {
    reply_markup: new InlineKeyboard()
      .text("O‘zbekcha", "register:uz")
      .text("Русский", "register:ru"),
  });
});
bot.callbackQuery(/^register:(uz|ru)$/, async (c) => {
  await c.answerCallbackQuery();
  c.session.locale = c.match[1] as State["locale"];
  c.session.step = "contact";
  await c.reply(
    t(
      c,
      "O‘z telefon raqamingizni ulashing.",
      "Поделитесь своим номером телефона.",
    ),
    {
      reply_markup: new Keyboard()
        .requestContact(t(c, "📞 Raqamni ulashish", "📞 Поделиться номером"))
        .resized(),
    },
  );
});
bot.on("message:contact", async (c) => {
  if (c.session.step !== "contact") return;
  if (c.message.contact.user_id !== c.from.id) {
    await c.reply(
      t(
        c,
        "Faqat o‘z kontaktingizni yuboring.",
        "Отправьте только свой контакт.",
      ),
    );
    return;
  }
  c.session.phone = c.message.contact.phone_number.replace(/^([^+])/, "+$1");
  c.session.step = "name";
  await c.reply(t(c, "Ismingizni yozing:", "Напишите ваше имя:"), {
    reply_markup: { remove_keyboard: true },
  });
});
bot.callbackQuery("consent:yes", async (c) => {
  await c.answerCallbackQuery();
  if (c.session.step !== "consent") return;
  c.session.step = "marketing";
  await c.reply(
    t(
      c,
      "Reklama xabarlariga ixtiyoriy rozilik berasizmi? Haftasiga ko‘pi bilan 2 ta; istalgan vaqtda chiqish mumkin.",
      "Согласны на рекламу? Не более 2 сообщений в неделю; отписка в любой момент.",
    ),
    {
      reply_markup: new InlineKeyboard()
        .text(t(c, "Ha", "Да"), "marketing:yes")
        .text(t(c, "Yo‘q", "Нет"), "marketing:no"),
    },
  );
});
bot.callbackQuery("consent:no", async (c) => {
  await c.answerCallbackQuery();
  c.session = { locale: c.session.locale };
  await c.reply(
    t(
      c,
      "Roziliksiz ro‘yxatdan o‘tib bo‘lmaydi. /start",
      "Без согласия регистрация невозможна. /start",
    ),
  );
});
bot.callbackQuery(/^marketing:(yes|no)$/, async (c) => {
  await c.answerCallbackQuery();
  if (c.session.step !== "marketing") return;
  c.session.marketing = c.match[1] === "yes";
  c.session.step = "birthday";
  await c.reply(
    t(
      c,
      "Tug‘ilgan kuningizni KK.OO shaklida yozing yoki o‘tkazib yuboring.",
      "Дата рождения ДД.ММ или пропустите.",
    ),
    {
      reply_markup: new InlineKeyboard().text(
        t(c, "O‘tkazish", "Пропустить"),
        "birthday:skip",
      ),
    },
  );
});
bot.callbackQuery("birthday:skip", async (c) => {
  await c.answerCallbackQuery();
  if (c.session.step === "birthday") await finish(c);
});
bot.on("message:text", async (c, next) => {
  const text = c.message.text.trim();
  if (text.startsWith("/")) return next();
  if (c.session.step === "name") {
    if (text.length < 2 || text.length > 100) {
      await c.reply("2–100 belgi / символов");
      return;
    }
    c.session.name = text;
    c.session.step = "consent";
    await c.reply(
      t(
        c,
        "Qoidalar: 100 000 so‘mlik tasdiqlangan xarid = 1 BeshBall. Ball pulga yechilmaydi, boshqa mijozga o‘tkazilmaydi. Chek 120 daqiqada yuboriladi, xodim tekshiradi. Telefon, ism, xarid tarixi va chek rasmini shu xizmat uchun saqlash va qayta ishlashga rozimisiz?",
        "Правила: 100 000 сум подтверждённых покупок = 1 BeshBall. Баллы нельзя обналичить или передать. Чек отправляется в течение 120 минут и проверяется сотрудником. Согласны на хранение и обработку телефона, имени, истории покупок и фото чеков для работы сервиса?",
      ),
      {
        reply_markup: new InlineKeyboard()
          .text(t(c, "Roziman", "Согласен"), "consent:yes")
          .text(t(c, "Yo‘q", "Нет"), "consent:no"),
      },
    );
    return;
  }
  if (c.session.step === "birthday") {
    const m = text.match(/^(\d{2})\.(\d{2})$/);
    if (!m) {
      await c.reply("KK.OO / ДД.ММ");
      return;
    }
    const birthday = `${m[2]}-${m[1]}`;
    const parsed = new Date(`2000-${birthday}T00:00:00Z`);
    if (
      !Number.isFinite(+parsed) ||
      parsed.toISOString().slice(5, 10) !== birthday
    ) {
      await c.reply(
        t(
          c,
          "Haqiqiy sana kiriting: KK.OO",
          "Введите действительную дату: ДД.ММ",
        ),
      );
      return;
    }
    if (c.session.editingBirthday) {
      await api("PATCH", `/bot/customers/${c.session.customerId}/preferences`, {
        birthDayMonth: birthday,
      });
      c.session.step = undefined;
      c.session.editingBirthday = false;
      await c.reply(
        t(c, "Tug‘ilgan kun saqlandi.", "Дата рождения сохранена."),
        { reply_markup: menu(c) },
      );
    } else await finish(c, birthday);
    return;
  }
  if (c.session.feedback) {
    if (!(await ready(c))) return;
    await api("POST", `/bot/customers/${c.session.customerId}/feedback`, {
      message: text,
    });
    c.session.feedback = false;
    await c.reply(
      t(
        c,
        "Fikringiz saqlandi va admin navbatiga yuborildi.",
        "Отзыв сохранён и поставлен в очередь администратору.",
      ),
      { reply_markup: menu(c) },
    );
    return;
  }
  await next();
});
bot.hears(["💰 BeshBallarim", "💰 Мои BeshBall"], async (c) => {
  if (!(await ready(c))) return;
  const card = await api<any>(
    "GET",
    `/customers/${c.session.customerId}/club-card`,
  );
  const nextGoal = card.nextGoal;
  const referralLink = `https://t.me/${bot.botInfo.username}?start=${card.referralPayload}`;
  const goalLabel = nextGoal
    ? `${c.session.locale === "ru" ? nextGoal.titleRu : nextGoal.titleUz} • ${nextGoal.progress.currentProgressPercent}%`
    : t(c, "Sovg‘a maqsadi yo‘q", "Нет цели подарка");
  const goalText = nextGoal
    ? t(
        c,
        `${nextGoal.titleUz}gacha oddiy kursda ${nextGoal.progress.requiredUnits.toLocaleString("ru-RU")} so‘mlik xarid qolgan.\nKeyingi ballgacha: ${card.remainingToNextBall.toLocaleString("ru-RU")} so‘m`,
        `До подарка «${nextGoal.titleRu}» осталось покупок на ${nextGoal.progress.requiredUnits.toLocaleString("ru-RU")} сум по обычному курсу.\nДо следующего балла: ${card.remainingToNextBall.toLocaleString("ru-RU")} сум`,
      )
    : t(
        c,
        "Yangi sovg‘a maqsadi tanlanishi mumkin.",
        "Можно выбрать новую цель подарка.",
      );

  await c.reply(
    t(
      c,
      `BeshBall — Besh Bola Lavash\nMijoz: ${c.from!.first_name ?? "Mijoz"}\nUmumiy ball: ${card.totalBalls}\nMavjud: ${card.availableBalls}\nBand qilingan: ${card.reservedBalls}\nProgress: ${card.nextBallProgressPercent}%\n${goalLabel}\n${goalText}\nReferal: ${referralLink}`,
      `BeshBall — Besh Bola Lavash\nКлиент: ${c.from!.first_name ?? "Клиент"}\nВсего баллов: ${card.totalBalls}\nДоступно: ${card.availableBalls}\nЗарезервировано: ${card.reservedBalls}\nПрогресс: ${card.nextBallProgressPercent}%\n${goalLabel}\n${goalText}\nРеферал: ${referralLink}`,
    ),
    {
      reply_markup: new InlineKeyboard()
        .text(t(c, "🎁 Sovg‘a olish", "🎁 Получить подарок"), "reward:goal")
        .text(t(c, "👥 Taklif", "👥 Пригласить"), "referral:share")
        .row()
        .text(t(c, "📋 Tarix", "📋 История"), "history:card"),
    },
  );
});
bot.hears(["📷 Chek yuborish", "📷 Отправить чек"], async (c) => {
  if (await ready(c)) await branches(c, "receipt");
});
bot.callbackQuery(/^branch:(receipt|gifts):(.+)$/, async (c) => {
  await c.answerCallbackQuery();
  if (!(await ready(c))) return;
  c.session.branchId = c.match[2];
  if (c.match[1] === "receipt") {
    if (c.session.pendingReceiptFileId) {
      await receiveReceipt(c, c.session.pendingReceiptFileId);
      return;
    }
    await c.reply(
      t(
        c,
        "Chekning aniq rasmini yuboring. JPG/PNG/WebP, 8 MB gacha; xariddan keyin 120 daqiqadan oshmasin.",
        "Отправьте чёткое фото чека. JPG/PNG/WebP до 8 МБ, не позднее 120 минут после покупки.",
      ),
    );
  } else await gifts(c);
});
async function receiveReceipt(c: Ctx, fileId: string) {
  if (!(await ready(c))) return;
  if (!c.session.branchId) {
    c.session.pendingReceiptFileId = fileId;
    const list = await api<any[]>("GET", "/branches");
    if (list.length === 1) c.session.branchId = list[0].id;
    else {
      await c.reply(
        t(
          c,
          "Rasm olindi. Chek qaysi filialdan olingan?",
          "Фото получено. Выберите филиал.",
        ),
      );
      const keyboard = new InlineKeyboard();
      for (const branch of list)
        keyboard.text(branch.name, `branch:receipt:${branch.id}`).row();
      await c.reply(t(c, "Filialni tanlang:", "Выберите филиал:"), {
        reply_markup: keyboard,
      });
      return;
    }
  }
  await c.reply(t(c, "Chek rasmini yuklayapman…", "Загружаю фото чека…"));
  const file = await c.api.getFile(fileId);
  if ((file.file_size ?? 0) > 8 * 1024 * 1024) {
    await c.reply("Rasm 8 MB dan oshmasin / Максимум 8 МБ");
    return;
  }
  const r = await fetch(
    `https://api.telegram.org/file/bot${token}/${file.file_path}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!r.ok) throw new Error("Rasm yuklanmadi");
  const buf = Buffer.from(await r.arrayBuffer());
  await api("POST", `/customers/${c.session.customerId}/receipts`, {
    imageBase64: buf.toString("base64"),
    branchId: c.session.branchId,
  });
  delete c.session.pendingReceiptFileId;
  await c.reply(
    t(
      c,
      "✅ Chek qabul qilindi. Tizim uni avtomatik tekshiradi: aniq bo‘lsa, ball zudlik bilan hisoblanadi va xabar keladi. Shubhali topilsa, xodim tekshiradi. 100 000 so‘m tasdiqlangan xarid = 1 BeshBall; kichik xaridlar ham yig‘ilib boradi.",
      "✅ Чек принят. Система проверит его автоматически: если всё чётко — баллы начислятся сразу с уведомлением. Если есть сомнения — проверит сотрудник. 100 000 сум = 1 BeshBall; небольшие покупки тоже накапливаются.",
    ),
  );
}
bot.on("message:photo", async (c) =>
  receiveReceipt(c, c.message.photo.at(-1)!.file_id),
);
bot.on("message:document", async (c) => {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(
      c.message.document.mime_type ?? "",
    )
  ) {
    await c.reply(
      t(
        c,
        "Chekni JPG, PNG yoki WebP rasm shaklida yuboring.",
        "Отправьте чек в формате JPG, PNG или WebP.",
      ),
    );
    return;
  }
  await receiveReceipt(c, c.message.document.file_id);
});
async function gifts(c: Ctx) {
  const [list, b] = await Promise.all([
    api<any[]>("GET", "/gifts"),
    api("GET", `/customers/${c.session.customerId}/balance`),
  ]);
  const available = list.filter((g) =>
    g.branches.some((x: any) => x.branchId === c.session.branchId),
  );
  if (!available.length)
    await c.reply(
      t(
        c,
        "Bu filialda hozir sovg‘a mavjud emas.",
        "В этом филиале пока нет подарков.",
      ),
    );
  for (const g of available) {
    const missing = Math.max(
      0,
      g.priceBalls * b.unitsPerBall - b.availableUnits,
    );
    await c.reply(
      `${c.session.locale === "ru" ? (g.nameRu ?? g.nameUz) : g.nameUz}\n${g.priceBalls} BeshBall • ${g.menuPriceSom} UZS\n${t(c, "Oddiy xarid kursida qolgan:", "Осталось по обычному курсу:")} ${missing} UZS`,
      {
        reply_markup: new InlineKeyboard().text(
          t(c, "Tanlash", "Выбрать"),
          `reserve:${g.id}`,
        ),
      },
    );
  }
}
bot.hears(["🎁 Sovg‘alar", "🎁 Подарки"], async (c) => {
  if (await ready(c)) await branches(c, "gifts");
});
async function qr(c: Ctx) {
  const r = c.session.reservation;
  if (!r || new Date(r.expiresAt) <= new Date()) {
    await c.reply(
      t(
        c,
        "Faol QR yo‘q. Sovg‘ani qayta tanlang.",
        "Нет активного QR. Выберите подарок.",
      ),
    );
    return;
  }
  await c.replyWithPhoto(
    new InputFile(
      await QRCode.toBuffer(r.qrToken, { width: 600, margin: 4 }),
      "beshball-qr.png",
    ),
    {
      caption: `${t(c, "Kassirga ko‘rsating", "Покажите кассиру")}\nID: ${r.reservationId}\n${t(c, "Zaxira kod", "Резервный код")}: ${r.backupCode}\n${t(c, "Muddati", "Срок")}: ${new Date(r.expiresAt).toLocaleTimeString("ru-RU", { timeZone: "Asia/Tashkent" })}`,
      reply_markup: new InlineKeyboard().text(
        t(c, "Bekor qilish", "Отменить"),
        "reserve:cancel",
      ),
    },
  );
}
bot.callbackQuery("reserve:cancel", async (c) => {
  await c.answerCallbackQuery();
  if (!(await ready(c))) return;
  await api(
    "POST",
    `/customers/${c.session.customerId}/reservations/cancel`,
    {},
  );
  delete c.session.reservation;
  await c.reply(t(c, "Rezerv bekor qilindi.", "Резерв отменён."));
});
bot.callbackQuery(/^reserve:([^:]+)$/, async (c) => {
  await c.answerCallbackQuery();
  if (!(await ready(c)) || !c.session.branchId) return;
  c.session.reservation = await api(
    "POST",
    `/customers/${c.session.customerId}/reservations`,
    { giftId: c.match[1], branchId: c.session.branchId },
  );
  await qr(c);
});
bot.hears(["📱 Faol QR", "📱 Активный QR"], async (c) => {
  if (!(await ready(c))) return;
  const active = await api<any[]>(
    "GET",
    `/bot/customers/${c.session.customerId}/reservations/active`,
  );
  if (!active.some((r) => r.id === c.session.reservation?.reservationId))
    delete c.session.reservation;
  await qr(c);
});
bot.hears(["🎉 Aksiyalar", "🎉 Акции"], async (c) => {
  const rows = await api<any[]>("GET", "/campaigns");
  await c.reply(
    rows.length
      ? rows
          .map(
            (r) =>
              `${r.nameUz}: ${r.bonusPercent ? `+${r.bonusPercent}%` : `×${r.multiplierNum}/${r.multiplierDen}`}\n${r.audienceNote ?? ""}`,
          )
          .join("\n\n")
      : t(c, "Hozir faol aksiya yo‘q.", "Активных акций пока нет."),
  );
});
async function shareReferral(c: Ctx) {
  if (!(await ready(c))) return;
  await c.reply(
    t(
      c,
      "Referal aksiyasi faol bo‘lsa, yangi do‘stning mos birinchi xarididan keyin bonus beriladi.",
      "Если реферальная акция активна, бонус начисляется после подходящей первой покупки нового друга.",
    ) + `\nhttps://t.me/${bot.botInfo.username}?start=ref_${c.from!.id}`,
  );
}
bot.hears(["👥 Do‘st taklif qilish", "👥 Пригласить друга"], shareReferral);
async function showHistory(c: Ctx) {
  if (!(await ready(c))) return;
  const rows = await api<any[]>(
    "GET",
    `/bot/customers/${c.session.customerId}/history?limit=15`,
  );
  await c.reply(
    rows.length
      ? rows
          .map(
            (r) =>
              `${r.unitsDelta > 0 ? "+" : ""}${r.unitsDelta} • ${r.reasonNote ?? r.type}\n${new Date(r.createdAt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })}`,
          )
          .join("\n\n")
      : t(c, "Tarix bo‘sh.", "История пуста."),
  );
}
bot.hears(["📋 Tarix", "📋 История"], showHistory);
bot.callbackQuery("reward:goal", async (c) => {
  await c.answerCallbackQuery();
  if (await ready(c)) await branches(c, "gifts");
});
bot.callbackQuery("referral:share", async (c) => {
  await c.answerCallbackQuery();
  await shareReferral(c);
});
bot.callbackQuery("history:card", async (c) => {
  await c.answerCallbackQuery();
  await showHistory(c);
});
bot.hears(["💬 Fikr va yordam", "💬 Отзыв и помощь"], async (c) => {
  if (!(await ready(c))) return;
  c.session.feedback = true;
  await c.reply(
    t(c, "Fikr yoki savolingizni yozing.", "Напишите отзыв или вопрос."),
  );
});
bot.hears(["⚙️ Sozlamalar", "⚙️ Настройки"], async (c) => {
  await c.reply(t(c, "Til va rozilik sozlamalari", "Язык и согласие"), {
    reply_markup: new InlineKeyboard()
      .text("O‘zbekcha", "lang:uz")
      .text("Русский", "lang:ru")
      .row()
      .text(t(c, "Reklamadan chiqish", "Отписаться"), "marketing:off")
      .text(t(c, "Reklamaga roziman", "Согласен на рекламу"), "marketing:on")
      .row()
      .text(
        t(c, "Tug‘ilgan kunni o‘zgartirish", "Изменить дату рождения"),
        "birthday:edit",
      )
      .text(
        t(c, "Tug‘ilgan kunni o‘chirish", "Удалить дату рождения"),
        "birthday:clear",
      )
      .row()
      .text(
        t(c, "Ma’lumot o‘chirish so‘rovi", "Запрос на удаление"),
        "privacy:delete",
      ),
  });
});
bot.callbackQuery(/^birthday:(edit|clear)$/, async (c) => {
  await c.answerCallbackQuery();
  if (!(await ready(c))) return;
  if (c.match[1] === "clear") {
    await api("PATCH", `/bot/customers/${c.session.customerId}/preferences`, {
      birthDayMonth: null,
    });
    c.session.step = undefined;
    c.session.editingBirthday = false;
    await c.reply(t(c, "Tug‘ilgan kun o‘chirildi.", "Дата рождения удалена."));
  } else {
    c.session.step = "birthday";
    c.session.editingBirthday = true;
    await c.reply(
      t(
        c,
        "Tug‘ilgan kunni KK.OO shaklida kiriting. Bekor qilish: /start",
        "Введите дату рождения ДД.ММ. Отмена: /start",
      ),
    );
  }
});
bot.callbackQuery(/^lang:(uz|ru)$/, async (c) => {
  await c.answerCallbackQuery();
  c.session.locale = c.match[1] as State["locale"];
  if (c.session.customerId)
    await api("PATCH", `/bot/customers/${c.session.customerId}/locale`, {
      locale: c.session.locale,
    });
  await c.reply(t(c, "Til o‘zgartirildi.", "Язык изменён."), {
    reply_markup: menu(c),
  });
});
bot.callbackQuery(/^marketing:(on|off)$/, async (c) => {
  await c.answerCallbackQuery();
  if (!(await ready(c))) return;
  await api("PATCH", `/bot/customers/${c.session.customerId}/preferences`, {
    marketingConsent: c.match[1] === "on",
  });
  await c.reply(
    t(c, "Reklama sozlamasi saqlandi.", "Настройка рекламы сохранена."),
  );
});
bot.callbackQuery("privacy:delete", async (c) => {
  await c.answerCallbackQuery();
  if (!(await ready(c))) return;
  await api("PATCH", `/bot/customers/${c.session.customerId}/preferences`, {
    requestDeletion: true,
    marketingConsent: false,
  });
  await c.reply(
    t(
      c,
      "So‘rov saqlandi. Admin hisob va saqlash majburiyatlarini tekshirib bog‘lanadi.",
      "Запрос сохранён. Администратор проверит обязательства хранения и свяжется с вами.",
    ),
  );
});
bot.catch(async (err) => {
  console.error("Bot update failed:", err.ctx.update.update_id);
  await err.ctx
    .reply(
      t(
        err.ctx,
        "Amal bajarilmadi. Qayta urinib ko‘ring yoki /start yuboring.",
        "Действие не выполнено. Повторите или отправьте /start.",
      ),
    )
    .catch(() => undefined);
});
export async function startBot() {
  await bot.init();
  if (process.env.ADMIN_URL?.startsWith("https://")) {
    for (const id of (process.env.SUPER_ADMIN_TELEGRAM_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value))) {
      await bot.api
        .setChatMenuButton({
          chat_id: Number(id),
          menu_button: {
            type: "web_app",
            text: "Admin panel",
            web_app: { url: process.env.ADMIN_URL },
          },
        })
        .catch(() =>
          console.error("Admin menu setup failed; /admin remains available"),
        );
    }
  }
  if (process.env.TELEGRAM_WEBHOOK_URL) {
    await bot.api.setWebhook(process.env.TELEGRAM_WEBHOOK_URL, {
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
    });
    while (true) {
      try {
        const u = await api("GET", "/bot/updates/next");
        if (u) {
          try {
            await bot.handleUpdate(u.payload);
            await api("POST", `/bot/updates/${u.id}/done`, {
              leaseToken: u.leaseToken,
            });
          } catch {
            console.error("Webhook update failed:", u.id);
            await api("POST", `/bot/updates/${u.id}/failed`, {
              leaseToken: u.leaseToken,
            });
          }
        } else await new Promise((r) => setTimeout(r, 300));
      } catch {
        console.error("Webhook queue unavailable; retrying");
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  } else {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    await bot.start({
      allowed_updates: ["message", "callback_query"],
      onStart: (info) =>
        console.log(`Bot @${info.username} ishga tushdi (polling).`),
    });
  }
}
