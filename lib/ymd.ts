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

/** Date → "YYYY-MM-DD"（ローカル暦日。未指定は ""）。 */
export function formatYmd(d?: Date): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
