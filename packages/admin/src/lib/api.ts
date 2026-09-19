declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        showScanQrPopup?: (
          options: { text: string },
          callback: (text: string) => boolean,
        ) => void;
        closeScanQrPopup?: () => void;
        isVersionAtLeast?: (v: string) => boolean;
      };
    };
  }
}
const base = import.meta.env.VITE_BACKEND_URL ?? "/api";
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-init-data": window.Telegram?.WebApp?.initData ?? "",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const data = await res
    .json()
    .catch(() => ({ error: "Serverga ulanish amalga oshmadi" }));
  if (!res.ok) throw new Error(data.error ?? `Xatolik: ${res.status}`);
  return data;
}
export const number = (v: unknown) =>
  Number(v ?? 0).toLocaleString("uz-UZ", { maximumFractionDigits: 2 });
export const date = (v: unknown) =>
  v
    ? new Date(String(v)).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })
    : "—";
