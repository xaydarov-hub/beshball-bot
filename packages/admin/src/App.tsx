import { useState, useEffect, type ReactNode } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import { api, number, date } from "./lib/api";
type Row = Record<string, any>;
type Me = { id: string; name: string; role: string; branchIds: string[] };
const labels: Record<string, string> = {
  SUPER_ADMIN: "Bosh admin",
  MANAGER: "Menejer",
  RECEIPT_REVIEWER: "Chek nazoratchisi",
  CASHIER: "Kassir",
  PENDING_REVIEW: "Tekshiruv kutilmoqda",
  APPROVED: "Tasdiqlangan",
  REJECTED: "Rad etilgan",
  REVERSED: "Qaytarilgan",
  RECEIVED: "Qabul qilingan",
  READING: "O‘qilmoqda",
  DRAFT: "Qoralama",
  SCHEDULED: "Rejalashtirilgan",
  QUEUED: "Navbatda",
  CANCELLED: "Bekor qilingan",
};
function useData(path: string) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api(path)
      .then((d) => {
        if (active) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, error, loading, reload: () => setRevision((n) => n + 1) };
}
function Heading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
function State({
  loading,
  error,
  empty = false,
}: {
  loading: boolean;
  error: string;
  empty?: boolean;
}) {
  return loading ? (
    <div className="empty" role="status">
      Yuklanmoqda…
    </div>
  ) : error ? (
    <div className="error" role="alert">
      {error}
    </div>
  ) : empty ? (
    <div className="empty">
      <strong>Hozircha ma’lumot yo‘q</strong>Yangi operatsiyalar shu yerda
      ko‘rinadi.
    </div>
  ) : null;
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  options,
}: {
  label: string;
  value: any;
  onChange: (v: any) => void;
  type?: string;
  options?: { value: string; label: string }[];
}) {
  return (
    <label className="field">
      {label}
      {type === "textarea" ? (
        <textarea
          aria-label={label}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : options ? (
        <select
          aria-label={label}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Tanlang</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={label}
          type={type}
          value={value ?? ""}
          onChange={(e) =>
            onChange(
              type === "number"
                ? e.target.value === ""
                  ? null
                  : Number(e.target.value)
                : e.target.value,
            )
          }
        />
      )}
    </label>
  );
}
function Check({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={value ?? false}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
function Badge({ value }: { value: string }) {
  return <span className="badge">{labels[value] ?? value}</span>;
}
function Dashboard() {
  const q = useData("/admin/reports/summary");
  const d = q.data;
  return (
    <>
      <Heading
        title="Biznes ko‘rinishi"
        subtitle="BeshBall sodiqlik dasturining haqiqiy natijalari"
      >
        <button className="btn secondary" onClick={q.reload}>
          Yangilash
        </button>
      </Heading>
      <State {...q} />
      {d && (
        <>
          <div className="stats">
            {[
              [
                "Tasdiqlangan cheklar",
                `${number(d.approvedReceiptsSumSom)} so‘m`,
                "Bot orqali tasdiqlangan",
              ],
              ["Mijozlar", number(d.totalCustomers), "Dastur ishtirokchilari"],
              [
                "Berilgan sovg‘alar",
                number(d.giftsGiven),
                "Kassir tasdiqlagan",
              ],
              ["Band qilingan ball", number(d.ballsReserved), "Faol rezervlar"],
            ].map(([title, value, note]) => (
              <div className="stat" key={title}>
                <small>{title}</small>
                <strong>{value}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>
          <div className="grid2">
            <section className="panel">
              <h2 className="section-title">Ball harakati</h2>
              {[
                ["Berilgan ball", d.ballsIssued],
                ["Sarflangan ball", d.ballsSpent],
                ["Sarflanmagan ball", d.outstandingBalls],
                ["Qayta xarid qilgan mijozlar", d.repeatCustomers],
              ].map(([k, v]) => (
                <div className="metric-row" key={k}>
                  <span>{k}</span>
                  <strong>{number(v)}</strong>
                </div>
              ))}
            </section>
            <section className="panel">
              <h2 className="section-title">Sovg‘alar iqtisodiyoti</h2>
              {[
                ["Menyu qiymati", d.giftMenuValueSom],
                ["Kiritilgan haqiqiy tannarx", d.knownGiftCostSom],
                ["Kelajak xarajati — taxmin", d.estimatedLiabilitySom],
                ["Oylik tashqi xarajat", d.externalMonthlyCostSom],
              ].map(([k, v]) => (
                <div className="metric-row" key={k}>
                  <span>{k}</span>
                  <strong>{number(v)} so‘m</strong>
                </div>
              ))}
              <p className="muted">
                {d.missingCostCount
                  ? `${d.missingCostCount} sovg‘a uchun tannarx kiritilmagan`
                  : "Barcha berilgan sovg‘alar tannarxi kiritilgan"}
              </p>
            </section>
          </div>
          <div className="notice">
            ZimZim API ulanmagan. Bu ko‘rsatkich kafening jami savdosi emas —
            bot orqali tasdiqlangan cheklar summasi. Kelajak xarajati sozlangan
            taxminiy ball qiymatiga asoslangan, sof foyda kafolati emas.{" "}
            {d.scopeNote}
          </div>
        </>
      )}
    </>
  );
}
function Receipts() {
  const [status, setStatus] = useState("PENDING_REVIEW");
  const [skip, setSkip] = useState(0);
  const q = useData(`/admin/receipts?status=${status}&skip=${skip}`);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <Heading
        title="Cheklar"
        subtitle="Haqiqiy savdoni solishtiring, keyin tasdiqlang"
      >
        <button className="btn secondary" onClick={q.reload}>
          Yangilash
        </button>
      </Heading>
      {selected ? (
        <ReceiptDetail
          id={selected}
          close={() => {
            setSelected(null);
            q.reload();
          }}
        />
      ) : (
        <>
          <div className="panel">
            <Field
              label="Holat"
              value={status}
              onChange={(v) => {
                setStatus(v);
                setSkip(0);
              }}
              options={[
                "PENDING_REVIEW",
                "RECEIVED",
                "READING",
                "APPROVED",
                "REJECTED",
                "REVERSED",
              ].map((value) => ({ value, label: labels[value] }))}
            />
            <State {...q} empty={q.data?.length === 0} />
            {q.data?.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mijoz</th>
                      <th>Filial</th>
                      <th>OCR summa</th>
                      <th>Qabul vaqti</th>
                      <th>Holat</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.map((r: Row) => (
                      <tr key={r.id}>
                        <td>{r.customer?.fullName}</td>
                        <td>{r.branch?.name}</td>
                        <td>
                          {r.ocrAmountSom
                            ? `${number(r.ocrAmountSom)} so‘m`
                            : "Aniqlanmagan"}
                        </td>
                        <td>{date(r.firstReceivedAt)}</td>
                        <td>
                          <Badge value={r.status} />
                        </td>
                        <td>
                          <button
                            className="btn secondary"
                            onClick={() => setSelected(r.id)}
                          >
                            Ko‘rish
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="actions">
            <button
              className="btn secondary"
              disabled={!skip}
              onClick={() => setSkip((n) => Math.max(0, n - 50))}
            >
              Oldingi
            </button>
            <button
              className="btn secondary"
              disabled={q.data?.length < 50}
              onClick={() => setSkip((n) => n + 50)}
            >
              Keyingi
            </button>
          </div>
        </>
      )}
    </>
  );
}
function ReceiptDetail({ id, close }: { id: string; close: () => void }) {
  const q = useData(`/admin/receipts/${id}`);
  const branches = useData("/admin/branches");
  const [form, setForm] = useState<Row>({
    purchaseSom: null,
    purchasedAt: "",
    branchId: "",
    tillId: "",
    externalSaleId: "",
    reason: "",
    saleVerified: false,
    paid: true,
    refunded: false,
    isDiscountedSet: false,
    bonusEligible: false,
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [operation] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (q.data)
      setForm((f) => ({
        ...f,
        purchaseSom: q.data.ocrAmountSom,
        branchId: q.data.branchId ?? "",
      }));
  }, [q.data]);
  const field = (name: string, value: any) =>
    setForm((f) => ({ ...f, [name]: value }));
  async function action(kind: string) {
    setBusy(true);
    setMessage("");
    try {
      await api(
        `/admin/receipts/${id}/${kind}`,
        kind === "approve"
          ? {
              ...form,
              purchasedAt: form.purchasedAt
                ? new Date(`${form.purchasedAt}:00+05:00`).toISOString()
                : "",
              idempotencyKey: operation,
            }
          : { reason: form.reason },
      );
      setMessage("Amal saqlandi.");
      q.reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="btn secondary" onClick={close}>
        ← Ro‘yxatga
      </button>
      <State {...q} />
      {q.data && (
        <div className="grid2" style={{ marginTop: 20 }}>
          <section className="panel">
            {q.data.imageUrl ? (
              <img
                className="receipt-image"
                src={q.data.imageUrl}
                alt="Mijoz yuborgan chek"
              />
            ) : (
              <p>Saqlash muddati tugagani uchun rasm o‘chirilgan.</p>
            )}
            <button className="btn secondary" onClick={q.reload}>
              Rasm ruxsatini yangilash
            </button>
            <p className="muted">
              Qabul qilindi: {date(q.data.firstReceivedAt)}
            </p>
            <div className="detail">
              {q.data.ocrRawText || "OCR matni aniqlanmagan"}
            </div>
            {q.data.duplicateFlags?.length > 0 && (
              <div className="notice">
                O‘xshash rasm belgisi bor. Boshqa chek bilan solishtiring; bu
                avtomatik rad etish sababi emas.
              </div>
            )}
          </section>
          <section className="panel">
            <h2 className="section-title">
              {q.data.customer?.fullName} <Badge value={q.data.status} />
            </h2>
            <div className="notice">
              ZimZim’da savdo, kassa, sana va chegirmadan keyingi summani qo‘lda
              solishtiring. OCR chek haqiqiyligini isbotlamaydi.
            </div>
            <Field
              label="Filial"
              value={form.branchId}
              onChange={(v) => field("branchId", v)}
              options={
                branches.data?.map((b: Row) => ({
                  value: b.id,
                  label: b.name,
                })) ?? []
              }
            />
            <Field
              label="Haqiqiy tegishli xarid summasi (so‘m)"
              type="number"
              value={form.purchaseSom}
              onChange={(v) => field("purchaseSom", v)}
            />
            <Field
              label="Xarid vaqti — Toshkent"
              type="datetime-local"
              value={form.purchasedAt}
              onChange={(v) => field("purchasedAt", v)}
            />
            <div className="form-grid">
              <Field
                label="Kassa raqami"
                value={form.tillId}
                onChange={(v) => field("tillId", v)}
              />
              <Field
                label="Noyob savdo / chek ID"
                value={form.externalSaleId}
                onChange={(v) => field("externalSaleId", v)}
              />
            </div>
            <Field
              label="Tekshiruv izohi / rad etish yoki qaytarish sababi"
              type="textarea"
              value={form.reason}
              onChange={(v) => field("reason", v)}
            />
            <Check
              label="Kafening to‘langan, qaytarilmagan savdosi ekanini tekshirdim"
              value={form.saleVerified}
              onChange={(v) => field("saleVerified", v)}
            />
            <Check
              label="Chegirmali set mavjud — faqat bazaviy ball"
              value={form.isDiscountedSet}
              onChange={(v) => field("isDiscountedSet", v)}
            />
            <Check
              label="Qo‘shimcha aksiya shartlarini tekshirdim"
              value={form.bonusEligible}
              onChange={(v) => field("bonusEligible", v)}
            />
            <div className="actions">
              {q.data.status === "PENDING_REVIEW" && (
                <>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => action("approve")}
                  >
                    Tasdiqlash
                  </button>
                  <button
                    className="btn danger"
                    disabled={busy}
                    onClick={() => action("reject")}
                  >
                    Rad etish
                  </button>
                </>
              )}
              {q.data.status === "APPROVED" && (
                <button
                  className="btn danger"
                  disabled={busy}
                  onClick={() => action("reverse")}
                >
                  Savdoni qaytarish
                </button>
              )}
            </div>
            {message && (
              <p role="status" className="notice">
                {message}
              </p>
            )}
            <h3>O‘zgarishlar tarixi</h3>
            {q.data.audit?.map((a: Row) => (
              <p key={a.id} className="muted">
                {date(a.createdAt)} · {a.action}
              </p>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
function Cashier() {
  const [token, setToken] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [record, setRecord] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState(() => crypto.randomUUID());
  async function inspect(qr?: string) {
    setBusy(true);
    setMessage("");
    setRecord(null);
    try {
      const r = await api(
        "/cashier/inspect",
        qr || token ? { qrToken: qr || token } : { reservationId, backupCode },
      );
      setRecord(r);
      setOperation(crypto.randomUUID());
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function scan() {
    const app = window.Telegram?.WebApp;
    if (app?.showScanQrPopup) {
      app.showScanQrPopup({ text: "Sovg‘a QR kodini skanerlang" }, (text) => {
        app.closeScanQrPopup?.();
        setToken(text);
        void inspect(text);
        return true;
      });
    } else
      setMessage(
        "Telegram Mini App’da kamera tugmasidan foydalaning yoki token / zaxira kodni kiriting.",
      );
  }
  async function confirm() {
    setBusy(true);
    try {
      await api("/cashier/confirm", {
        reservationId: record!.reservationId,
        proof: record!.proof,
        idempotencyKey: operation,
      });
      setRecord(null);
      setToken("");
      setMessage("Sovg‘a berildi. Ball bir marta yechildi.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="Sovg‘a berish"
        subtitle="Avval skanerlang. Ma’lumotni tekshirib, alohida tasdiqlang."
      />
      <div className="grid2">
        <section className="panel">
          <div className="scanner">
            <span className="scan-icon" aria-hidden="true">
              ▣
            </span>
            <h2>Mijozning QR kodini o‘qing</h2>
            <p className="muted">Skanerlashning o‘zi ball yechmaydi.</p>
            <button className="btn" onClick={scan} disabled={busy}>
              Kamerani ochish
            </button>
          </div>
          <Field
            label="QR token — qo‘lda kiritish"
            value={token}
            onChange={setToken}
          />
          <div className="form-grid">
            <Field
              label="Rezerv ID"
              value={reservationId}
              onChange={setReservationId}
            />
            <Field
              label="6 raqamli zaxira kod"
              value={backupCode}
              onChange={setBackupCode}
            />
          </div>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => inspect()}
          >
            Ma’lumotni tekshirish
          </button>
        </section>
        <section className="panel">
          <h2 className="section-title">Tasdiqlash</h2>
          {record ? (
            <>
              <h2>{record.giftName}</h2>
              <div className="metric-row">
                <span>Mijoz</span>
                <strong>{record.customerName}</strong>
              </div>
              <div className="metric-row">
                <span>Telefon</span>
                <strong>{record.phone}</strong>
              </div>
              <div className="metric-row">
                <span>Narx</span>
                <strong>{record.priceBalls} BeshBall</strong>
              </div>
              <div className="metric-row">
                <span>Jami birlik</span>
                <strong>{number(record.balance.totalUnits)}</strong>
              </div>
              <p className="muted">Muddati: {date(record.expiresAt)}</p>
              <button className="btn" disabled={busy} onClick={confirm}>
                Mahsulotni berdim — tasdiqlash
              </button>
            </>
          ) : (
            <div className="empty">
              <strong>QR kutilmoqda</strong>Mijoz va sovg‘a shu yerda ko‘rinadi.
            </div>
          )}
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

type Def = {
  key: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
};
const giftDefs: Def[] = [
  { key: "nameUz", label: "Nomi (o‘zbekcha)" },
  { key: "nameRu", label: "Nomi (ruscha)" },
  { key: "descriptionUz", label: "Tavsif", type: "textarea" },
  { key: "imageUrl", label: "Rasmning HTTPS manzili" },
  { key: "priceBalls", label: "BeshBall narxi", type: "number" },
  { key: "menuPriceSom", label: "Menyu narxi (so‘m)", type: "number" },
  { key: "realCostSom", label: "Haqiqiy tannarx (ixtiyoriy)", type: "number" },
  { key: "dailyLimit", label: "Kunlik limit (ixtiyoriy)", type: "number" },
  { key: "active", label: "Faol", type: "checkbox" },
  {
    key: "temporarilyUnavailable",
    label: "Vaqtincha mavjud emas",
    type: "checkbox",
  },
];
const campaignDefs: Def[] = [
  { key: "nameUz", label: "Aksiya nomi" },
  {
    key: "kind",
    label: "Aksiya turi",
    options: [
      ["AMOUNT_TIER", "Xarid summasi"],
      ["SECOND_PURCHASE_7D", "7 kun ichida ikkinchi xarid"],
      ["REFERRAL_FIRST_PURCHASE", "Referal"],
      ["WINBACK_21D", "21 kundan keyin qaytish"],
      ["BIRTHDAY_WINDOW", "Tug‘ilgan kun"],
      ["OFF_PEAK_MULTIPLIER", "Sust vaqt"],
    ].map(([value, label]) => ({ value, label })),
  },
  { key: "bonusPercent", label: "Ball progress bonusi (%)", type: "number" },
  { key: "minAmountSom", label: "Minimal xarid (so‘m)", type: "number" },
  {
    key: "multiplierNum",
    label: "Ko‘paytiruvchi surat (masalan 3)",
    type: "number",
  },
  {
    key: "multiplierDen",
    label: "Ko‘paytiruvchi maxraj (masalan 2)",
    type: "number",
  },
  { key: "startsAt", label: "Boshlanish — Toshkent", type: "datetime-local" },
  { key: "endsAt", label: "Tugash — Toshkent", type: "datetime-local" },
  { key: "audienceNote", label: "Auditoriya va shartlar", type: "textarea" },
  {
    key: "budgetSom",
    label: "Budjet (taxminiy xarajat, so‘m)",
    type: "number",
  },
  { key: "usageLimitTotal", label: "Jami foydalanish limiti", type: "number" },
  {
    key: "usageLimitPerCustomer",
    label: "Bir mijoz uchun limit",
    type: "number",
  },
  { key: "hours", label: "Sust vaqt soatlari (vergul bilan: 14,15,16)" },
  { key: "active", label: "Faol", type: "checkbox" },
];
const staffDefs: Def[] = [
  { key: "telegramUserId", label: "Telegram ID" },
  { key: "fullName", label: "To‘liq ism" },
  {
    key: "role",
    label: "Rol",
    options: ["SUPER_ADMIN", "MANAGER", "RECEIPT_REVIEWER", "CASHIER"].map(
      (value) => ({ value, label: labels[value] }),
    ),
  },
  { key: "active", label: "Faol", type: "checkbox" },
];
const initial: Record<string, Row> = {
  gifts: {
    nameUz: "",
    nameRu: null,
    descriptionUz: null,
    imageUrl: null,
    priceBalls: 1,
    menuPriceSom: 0,
    realCostSom: null,
    dailyLimit: null,
    active: true,
    temporarilyUnavailable: false,
    branchIds: [],
  },
  campaigns: {
    nameUz: "",
    kind: "AMOUNT_TIER",
    bonusPercent: 5,
    multiplierNum: null,
    multiplierDen: null,
    minAmountSom: 50000,
    active: false,
    startsAt: null,
    endsAt: null,
    audienceNote: null,
    budgetSom: null,
    usageLimitTotal: null,
    usageLimitPerCustomer: 1,
    config: { hours: [] },
  },
  staff: {
    telegramUserId: "",
    fullName: "",
    role: "CASHIER",
    active: true,
    branchIds: [],
  },
  branches: { name: "", address: "", active: true },
};
function Crud({ kind, title, me }: { kind: string; title: string; me: Me }) {
  const q = useData(`/admin/${kind}`);
  const branches = useData("/admin/branches");
  const [form, setForm] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const defs =
    kind === "gifts"
      ? giftDefs
      : kind === "campaigns"
        ? campaignDefs
        : kind === "staff"
          ? staffDefs
          : [
              { key: "name", label: "Filial nomi" },
              { key: "address", label: "Manzil" },
              { key: "active", label: "Faol", type: "checkbox" },
            ];
  function edit(row: Row) {
    const f: Row = {
      ...initial[kind],
      ...row,
      branchIds:
        row.config?.branchIds ??
        row.branches?.map((b: Row) => b.branchId) ??
        row.branchAccess?.map((b: Row) => b.branchId) ??
        [],
      hours: row.config?.hours?.join(",") ?? "",
    };
    for (const k of ["startsAt", "endsAt"])
      if (f[k])
        f[k] = new Date(new Date(f[k]).getTime() + 5 * 3600000)
          .toISOString()
          .slice(0, 16);
    setForm(f);
    setMessage("");
  }
  async function save() {
    setBusy(true);
    try {
      const f = { ...form };
      for (const k of ["startsAt", "endsAt"])
        if (k in f)
          f[k] = f[k] ? new Date(`${f[k]}:00+05:00`).toISOString() : null;
      for (const k of ["nameRu", "descriptionUz", "imageUrl", "audienceNote"])
        if (f[k] === "") f[k] = null;
      if (kind === "campaigns")
        f.config = {
          hours: String(f.hours ?? "")
            .split(",")
            .filter(Boolean)
            .map(Number),
          branchIds: f.branchIds,
        };
      await api(`/admin/${kind}`, f);
      setForm(null);
      q.reload();
      setMessage("Saqlandi.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title={title}
        subtitle={
          kind === "campaigns"
            ? "Bir chek uchun eng foydali bitta aksiya. Yangi aksiyalar nofaol yaratiladi."
            : "O‘zgarishlar audit tarixida saqlanadi."
        }
      >
        {(me.role === "SUPER_ADMIN" || kind === "campaigns") && (
          <button className="btn" onClick={() => edit(initial[kind])}>
            + Yangi qo‘shish
          </button>
        )}
      </Heading>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      {form ? (
        <section className="panel">
          <h2 className="section-title">
            {form.id ? "Tahrirlash" : "Yangi yozuv"}
          </h2>
          <div className="form-grid">
            {defs.map((d) =>
              d.type === "checkbox" ? (
                <Check
                  key={d.key}
                  label={d.label}
                  value={form[d.key]}
                  onChange={(v) => setForm({ ...form, [d.key]: v })}
                />
              ) : (
                <Field
                  key={d.key}
                  label={d.label}
                  type={d.type}
                  options={d.options}
                  value={form[d.key]}
                  onChange={(v) => setForm({ ...form, [d.key]: v })}
                />
              ),
            )}
          </div>
          {["gifts", "staff", "campaigns"].includes(kind) && (
            <>
              <h3>Ruxsat etilgan filiallar</h3>
              {branches.data?.map((b: Row) => (
                <Check
                  key={b.id}
                  label={b.name}
                  value={form.branchIds.includes(b.id)}
                  onChange={(v) =>
                    setForm({
                      ...form,
                      branchIds: v
                        ? [...form.branchIds, b.id]
                        : form.branchIds.filter((x: string) => x !== b.id),
                    })
                  }
                />
              ))}
            </>
          )}
          <div className="actions">
            <button className="btn" disabled={busy} onClick={save}>
              Saqlash
            </button>
            <button className="btn secondary" onClick={() => setForm(null)}>
              Bekor qilish
            </button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <State {...q} empty={q.data?.length === 0} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nomi</th>
                  <th>Tafsilot</th>
                  <th>Holat</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data?.map((r: Row) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.nameUz ?? r.fullName ?? r.name}</strong>
                    </td>
                    <td>
                      {kind === "gifts"
                        ? `${r.priceBalls} ball · ${number(r.menuPriceSom)} so‘m`
                        : kind === "staff"
                          ? labels[r.role]
                          : kind === "campaigns"
                            ? `${r.bonusPercent ?? 0}% progress`
                            : r.address}
                    </td>
                    <td>
                      <Badge value={r.active ? "Faol" : "Nofaol"} />
                    </td>
                    <td>
                      {(me.role === "SUPER_ADMIN" || kind === "campaigns") && (
                        <button
                          className="btn secondary"
                          onClick={() => edit(r)}
                        >
                          Tahrirlash
                        </button>
                      )}
                      {kind === "gifts" &&
                        me.role === "MANAGER" &&
                        r.branches
                          .filter((b: Row) => me.branchIds.includes(b.branchId))
                          .map((b: Row) => (
                            <button
                              key={b.id}
                              className="btn secondary"
                              onClick={async () => {
                                try {
                                  await api(
                                    `/admin/gifts/${r.id}/availability`,
                                    { branchId: b.branchId, active: !b.active },
                                  );
                                  q.reload();
                                } catch (e) {
                                  setMessage((e as Error).message);
                                }
                              }}
                            >
                              {
                                branches.data?.find(
                                  (x: Row) => x.id === b.branchId,
                                )?.name
                              }
                              : {b.active ? "Mavjud" : "Mavjud emas"}
                            </button>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
function Customers({ me }: { me: Me }) {
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const q = useData(
    `/admin/customers?search=${encodeURIComponent(search)}&skip=${skip}`,
  );
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <Heading title="Mijozlar" subtitle="Profil, rozilik va ball tarixi" />
      {selected ? (
        <CustomerDetail
          id={selected}
          me={me}
          close={() => {
            setSelected(null);
            q.reload();
          }}
        />
      ) : (
        <section className="panel">
          <Field
            label="Ism yoki telefon bo‘yicha qidirish"
            value={search}
            onChange={(value) => {
              setSearch(value);
              setSkip(0);
            }}
          />
          <State {...q} empty={q.data?.length === 0} />
          {q.data?.map((c: Row) => (
            <div className="record" key={c.id}>
              <div className="heading" style={{ marginBottom: 0 }}>
                <div>
                  <h3>{c.fullName}</h3>
                  <p>
                    {c.phoneE164} ·{" "}
                    {c.blocked
                      ? "Bloklangan"
                      : c.riskHold
                        ? "Hisob tekshiruvda"
                        : "Faol"}
                  </p>
                  <p>
                    Reklama:{" "}
                    {c.marketingConsentAt && !c.marketingUnsubscribed
                      ? "Rozilik bor"
                      : "Yuborilmaydi"}
                  </p>
                  {c.deletionRequestedAt && (
                    <Badge value="O‘chirish so‘ralgan" />
                  )}
                </div>
                <button
                  className="btn secondary"
                  onClick={() => setSelected(c.id)}
                >
                  Profil
                </button>
              </div>
            </div>
          ))}
          <div className="actions">
            <button
              className="btn secondary"
              disabled={q.loading || skip === 0}
              onClick={() => setSkip(Math.max(0, skip - 50))}
            >
              Oldingi
            </button>
            <button
              className="btn secondary"
              disabled={q.loading || q.data?.length !== 50}
              onClick={() => setSkip(skip + 50)}
            >
              Keyingi
            </button>
          </div>
        </section>
      )}
    </>
  );
}
function CustomerDetail({
  id,
  me,
  close,
}: {
  id: string;
  me: Me;
  close: () => void;
}) {
  const q = useData(`/admin/customers/${id}`);
  const [reason, setReason] = useState("");
  const [delta, setDelta] = useState<number | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(type: string) {
    setBusy(true);
    try {
      await api(
        `/admin/customers/${id}/${type}`,
        type === "block"
          ? { blocked: !q.data.blocked, reason }
          : { unitsDelta: delta, reasonNote: reason, idempotencyKey: key },
      );
      q.reload();
      setKey(crypto.randomUUID());
      setMessage("Saqlandi.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="btn secondary" onClick={close}>
        ← Mijozlar
      </button>
      <State {...q} />
      {q.data && (
        <section className="panel" style={{ marginTop: 20 }}>
          <h2>{q.data.fullName}</h2>
          <p>{q.data.phoneE164}</p>
          <div className="stats">
            <div className="stat">
              <small>Sarflash mumkin</small>
              <strong>{number(q.data.balance.availableBalls)}</strong>
              <small>BeshBall</small>
            </div>
            <div className="stat">
              <small>Jami birlik</small>
              <strong>{number(q.data.balance.totalUnits)}</strong>
            </div>
            <div className="stat">
              <small>Band birlik</small>
              <strong>{number(q.data.balance.reservedUnits)}</strong>
            </div>
          </div>
          <Field
            label="O‘zgartirish sababi"
            type="textarea"
            value={reason}
            onChange={setReason}
          />
          {me.role === "SUPER_ADMIN" && (
            <Field
              label="Balans tuzatish (birlik; manfiy qiymat yechadi)"
              type="number"
              value={delta}
              onChange={setDelta}
            />
          )}
          <div className="actions">
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => act("block")}
            >
              {q.data.blocked ? "Blokdan chiqarish" : "Bloklash"}
            </button>
            {me.role === "SUPER_ADMIN" && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => act("adjust-balance")}
              >
                Sabab bilan tuzatish
              </button>
            )}
          </div>
          {message && <div className="notice">{message}</div>}
          <h3>Hisob tarixi</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Birlik</th>
                  <th>Sabab</th>
                </tr>
              </thead>
              <tbody>
                {q.data.ledger.map((e: Row) => (
                  <tr key={e.id}>
                    <td>{date(e.createdAt)}</td>
                    <td>{number(e.unitsDelta)}</td>
                    <td>{e.reasonNote ?? e.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
function Broadcasts() {
  const q = useData("/admin/broadcasts");
  const branches = useData("/admin/branches");
  const [form, setForm] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api("/admin/broadcasts", {
        ...form,
        bodyRu: form!.bodyRu || null,
        imageUrl: form!.imageUrl || null,
        buttonLabel: form!.buttonLabel || null,
        buttonUrl: form!.buttonUrl || null,
        audienceBranchId: form!.audienceBranchId || null,
        scheduledAt: form!.scheduledAt
          ? new Date(`${form!.scheduledAt}:00+05:00`).toISOString()
          : null,
      });
      setForm(null);
      q.reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(id: string, action: string) {
    if (
      action === "confirm" &&
      !window.confirm(
        "Reklamaga rozilik bergan mijozlarga yuborishni tasdiqlaysizmi?",
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/admin/broadcasts/${id}/${action}`, {});
      q.reload();
      setMessage(
        "Amal navbatga qo‘yildi. Yuborish server sozlamasiga bog‘liq.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="Xabarlar"
        subtitle="Faqat rozilik bergan mijozlarga. Haftasiga ko‘pi bilan 2 reklama."
      >
        <button
          className="btn"
          onClick={() =>
            setForm({
              titleInternal: "",
              bodyUz: "",
              bodyRu: "",
              imageUrl: "",
              buttonLabel: "",
              buttonUrl: "",
              scheduledAt: "",
              audienceBranchId: "",
            })
          }
        >
          + Xabar yaratish
        </button>
      </Heading>
      {message && <div className="notice">{message}</div>}
      {form ? (
        <div className="grid2">
          <section className="panel">
            {[
              { key: "titleInternal", label: "Ichki nom" },
              { key: "bodyUz", label: "Matn (o‘zbekcha)", type: "textarea" },
              { key: "bodyRu", label: "Matn (ruscha)", type: "textarea" },
              { key: "imageUrl", label: "Rasm — HTTPS" },
              { key: "buttonLabel", label: "Tugma matni" },
              { key: "buttonUrl", label: "Tugma havolasi — HTTPS" },
              {
                key: "scheduledAt",
                label: "Yuborish vaqti — Toshkent",
                type: "datetime-local",
              },
            ].map((d) => (
              <Field
                key={d.key}
                label={d.label}
                type={d.type}
                value={form[d.key]}
                onChange={(v) => setForm({ ...form, [d.key]: v })}
              />
            ))}
            <Field
              label="Auditoriya filiali (bo‘sh — barcha; bosh admin)"
              value={form.audienceBranchId}
              onChange={(v) => setForm({ ...form, audienceBranchId: v })}
              options={
                branches.data?.map((b: Row) => ({
                  value: b.id,
                  label: b.name,
                })) ?? []
              }
            />
            <div className="actions">
              <button className="btn" disabled={busy} onClick={save}>
                Qoralamani saqlash
              </button>
              <button className="btn secondary" onClick={() => setForm(null)}>
                Bekor qilish
              </button>
            </div>
          </section>
          <section className="panel">
            <h2 className="section-title">Oldindan ko‘rish</h2>
            <div className="preview-message">
              {form.bodyUz || "Xabaringiz shu yerda ko‘rinadi."}
              {form.buttonLabel && (
                <p>
                  <span className="btn secondary">{form.buttonLabel}</span>
                </p>
              )}
            </div>
            <p className="muted">
              Yuborilgan xabar o‘qilgan deb hisoblanmaydi.
            </p>
          </section>
        </div>
      ) : (
        <section className="panel">
          <State {...q} empty={q.data?.length === 0} />
          {q.data?.map((b: Row) => (
            <div className="record" key={b.id}>
              <h3>
                {b.titleInternal} <Badge value={b.status} />
              </h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{b.bodyUz}</p>
              <p className="muted">
                {date(b.scheduledAt)} · Yuborilgan:{" "}
                {b.recipientLogs.filter((r: Row) => r.status === "SENT").length}{" "}
                · Xato:{" "}
                {
                  b.recipientLogs.filter((r: Row) => r.status === "FAILED")
                    .length
                }
              </p>
              <div className="actions">
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => action(b.id, "test")}
                >
                  O‘zimga test
                </button>
                {b.status === "DRAFT" && (
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => action(b.id, "confirm")}
                  >
                    Yuborishni tasdiqlash
                  </button>
                )}
                {b.status !== "CANCELLED" && (
                  <button
                    className="btn danger"
                    disabled={busy}
                    onClick={() => action(b.id, "cancel")}
                  >
                    To‘xtatish
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
function Settings() {
  const q = useData("/admin/settings");
  const [form, setForm] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);
  const names: Record<string, string> = {
    unitsPerBall: "1 ball uchun birlik (kurs o‘zgarmaydi)",
    qrSeconds: "QR muddati (soniya, ko‘pi bilan 180)",
    receiptMinutes: "Chek muddati (daqiqa, ko‘pi bilan 120)",
    weeklyAdLimit: "Haftalik reklama limiti",
    quietStart: "Tungi cheklov boshlanish soati",
    quietEnd: "Tungi cheklov tugash soati",
    pointExpiryDays: "Yangi ball lotlari muddati (kun; 0 — o‘chiq)",
    receiptRetentionDays: "Chek rasmini saqlash (kun)",
    bonusCostSomPerBall: "1 ball uchun taxminiy xarajat (so‘m)",
    externalMonthlyCostSom: "Oylik server/tashqi xizmat xarajati (so‘m)",
    autoApproveEnabled: "OCR avtomatik tasdiqlash (1=yoqilgan, 0=o‘chiq)",
    autoApproveMinConfidence: "Avtomatik tasdiqlash uchun minimal OCR ishonchi (%)",
    autoApproveMinAmountSom: "Avtomatik tasdiqlash uchun eng kichik summa (so‘m)",
    autoApproveMaxAmountSom: "Avtomatik tasdiqlash uchun eng katta summa (so‘m)",
  };
  return (
    <>
      <Heading
        title="Sozlamalar"
        subtitle="O‘zgarishlar auditda qayd etiladi"
      />
      <State {...q} />
      {form && (
        <section className="panel">
          <div className="notice">
            Ball muddatini yoqishdan oldin qoidalarni mijozlarga e’lon qiling.
            Yangi muddat faqat keyin yaratilgan lotlarga qo‘llanadi; faol
            rezervlar muddat tugashidan himoyalanadi.
          </div>
          <div className="form-grid">
            {Object.entries(names).map(([k, label]) => (
              <Field
                key={k}
                label={label}
                type="number"
                value={form[k]}
                onChange={(v) => setForm({ ...form, [k]: v })}
              />
            ))}
          </div>
          <button
            className="btn"
            onClick={async () => {
              try {
                await api("/admin/settings", form);
                setMessage("Sozlamalar saqlandi.");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Saqlash
          </button>
          {message && <div className="notice">{message}</div>}
        </section>
      )}
    </>
  );
}
function Logs({ feedback = false }: { feedback?: boolean }) {
  const q = useData(feedback ? "/admin/feedback" : "/admin/audit");
  return (
    <>
      <Heading
        title={feedback ? "Fikr va yordam" : "Audit tarixi"}
        subtitle={
          feedback
            ? "Mijozlarning savol va takliflari"
            : "Kim, qachon va nimani o‘zgartirdi — o‘chirish amali yo‘q"
        }
      />
      <section className="panel">
        <State {...q} empty={q.data?.length === 0} />
        {q.data?.map((r: Row) => (
          <div className="record" key={r.id}>
            <h3>
              {feedback
                ? r.customer?.fullName
                : (r.staffUser?.fullName ?? "Tizim")}
            </h3>
            <p className="muted">{date(r.createdAt)}</p>
            <p>{feedback ? r.message : r.action}</p>
            {!feedback && (
              <details>
                <summary>O‘zgarish tafsiloti</summary>
                <pre className="detail">
                  {JSON.stringify(
                    { oldin: r.beforeJson, keyin: r.afterJson },
                    null,
                    2,
                  )}
                </pre>
              </details>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
const nav = [
  ["/", "◫", "Hisobotlar", ["SUPER_ADMIN", "MANAGER"]],
  ["/cheklar", "▤", "Cheklar", ["SUPER_ADMIN", "MANAGER", "RECEIPT_REVIEWER"]],
  ["/kassir", "▣", "Sovg‘a berish", ["SUPER_ADMIN", "MANAGER", "CASHIER"]],
  ["/mijozlar", "♧", "Mijozlar", ["SUPER_ADMIN", "MANAGER"]],
  ["/sovgalar", "◇", "Sovg‘alar", ["SUPER_ADMIN", "MANAGER"]],
  ["/aksiyalar", "✧", "Aksiyalar", ["SUPER_ADMIN", "MANAGER"]],
  ["/xabarlar", "✉", "Xabarlar", ["SUPER_ADMIN", "MANAGER"]],
  ["/xodimlar", "♙", "Xodimlar", ["SUPER_ADMIN"]],
  ["/filiallar", "⌂", "Filiallar", ["SUPER_ADMIN"]],
  ["/fikrlar", "☏", "Fikr va yordam", ["SUPER_ADMIN"]],
  ["/audit", "≡", "Audit", ["SUPER_ADMIN"]],
  ["/sozlamalar", "⚙", "Sozlamalar", ["SUPER_ADMIN"]],
] as const;
export default function App() {
  const me = useData("/admin/me");
  const location = useLocation();
  if (me.loading)
    return (
      <div className="auth panel">
        <div className="brand">
          Besh<b>Ball</b>
        </div>
        <State {...me} />
      </div>
    );
  if (me.error || !me.data)
    return (
      <div className="auth panel">
        <div className="brand">
          Besh<b>Ball</b>
          <small>BESH BOLA LAVASH</small>
        </div>
        <h1>Xush kelibsiz</h1>
        <p className="muted">
          Boshqaruv paneliga Telegram botdagi Mini App tugmasi orqali kiring.
          Kirish huquqi faol xodimlar uchun beriladi.
        </p>
        <div className="error">{me.error}</div>
        <button className="btn" onClick={me.reload}>
          Qayta tekshirish
        </button>
      </div>
    );
  const user = me.data as Me;
  const allowed = nav.filter((n) =>
    (n[3] as readonly string[]).includes(user.role),
  );
  const can = allowed.some((n) => n[0] === location.pathname);
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          Besh<b>Ball</b>
          <small>BESH BOLA LAVASH</small>
        </div>
        <nav className="nav" aria-label="Asosiy menyu">
          {allowed.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end>
              <span aria-hidden="true">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <footer>
          Sodiqlik kichik qadamlardan boshlanadi.
          <br />
          Besh Bola Lavash
        </footer>
      </aside>
      <div>
        <header className="topbar">
          <span>
            BeshBall <small>/ Boshqaruv</small>
          </span>
          <span>
            {user.name} <span className="pill">{labels[user.role]}</span>
          </span>
        </header>
        <main className="content">
          {!can ? (
            <div className="panel">
              <h1>{labels[user.role]} paneli</h1>
              <p>Yuqoridagi menyudan ruxsat etilgan bo‘limni tanlang.</p>
            </div>
          ) : (
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/cheklar" element={<Receipts />} />
              <Route path="/kassir" element={<Cashier />} />
              <Route path="/mijozlar" element={<Customers me={user} />} />
              <Route
                path="/sovgalar"
                element={
                  <Crud kind="gifts" title="Sovg‘alar katalogi" me={user} />
                }
              />
              <Route
                path="/aksiyalar"
                element={<Crud kind="campaigns" title="Aksiyalar" me={user} />}
              />
              <Route
                path="/xodimlar"
                element={
                  <Crud kind="staff" title="Xodimlar va ruxsatlar" me={user} />
                }
              />
              <Route
                path="/filiallar"
                element={<Crud kind="branches" title="Filiallar" me={user} />}
              />
              <Route path="/xabarlar" element={<Broadcasts />} />
              <Route path="/audit" element={<Logs />} />
              <Route path="/fikrlar" element={<Logs feedback />} />
              <Route path="/sozlamalar" element={<Settings />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  );
}
