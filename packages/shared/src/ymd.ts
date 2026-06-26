// react-day-picker 用のローカル日付 ↔ "YYYY-MM-DD" 変換（DB を触らない純粋関数）。
// DatePopover / DateRangePopover / EventForm が date-picker の value・disabled
// マッチャに使う。ここは「ローカルTZの 00:00」で Date を作るのが正しい
// （壁時計の暦日をそのまま扱う＝floating time の意図と一致）。
// schedule.ts は逆に UTC 専用なので、ローカル Date を扱うこのユーティリティは分ける。

/** "YYYY-MM-DD" → ローカル 00:00 の Date。空・不正は undefined。 */
export function parseYmd(s?: string | null): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/**
 * "YYYY-MM-DD" → ロケール別の全情報表示（年含む）。
 * ja: "2026/6/1"  /  en: "Jun 1, 2026"
 */
export function formatTripDate(ymd: string | null | undefined, locale: string): string {
  if (!ymd) return "?";
  if (locale === "en") {
    const date = new Date(ymd + "T00:00:00Z");
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}/${m}/${d}`;
}

/**
 * 旅行の開始〜終了日をロケール別に整形する。
 * ja: 年省略なし "2026/6/21 – 2026/6/26"
 * en 同年: "Jun 21 – Jun 26, 2026"（開始の年を省略）
 * en 年またぎ: "Jun 21, 2026 – Jun 26, 2027"
 */
export function formatTripDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  locale: string,
): string {
  const sep = "–";
  const e = formatTripDate(end, locale);
  if (locale === "en" && start && end) {
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    const startDate = new Date(start + "T00:00:00Z");
    const startStr = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
      timeZone: "UTC",
    }).format(startDate);
    return `${startStr} ${sep} ${e}`;
  }
  return `${formatTripDate(start, locale)} ${sep} ${e}`;
}

/** Date → "YYYY-MM-DD"（ローカル暦日。未指定は ""）。 */
export function formatYmd(d?: Date): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
