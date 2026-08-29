// 為替レートの取得（取り込み時に1回だけ）。
//
// **なぜ要るか**: 外貨の費用を作るには default_currency への換算レートが要る。
// レートは「同じ旅行の同じ通貨の既存費用の平均」から取る仕組みだが、その通貨の
// 1件目は履歴が無いので決められない。今までそこで手が止まっていた（実データで、
// JPY の旅行に USD のレシートが 75 件溜まり、平均が無いため1件も自動確定できず、
// しかも何も知らせていなかった）。
//
// **1件目だけをこれで埋める。** 手入力があればそちらが最優先で、実績が1件でも
// できれば以降はその平均に切り替わる。市場レートよりユーザーの実効レート
// （カード手数料込み）の方が実態に近く、手数料は 1.6〜3% と旅行中の為替変動
// （期間全体で 1% 前後）より大きいため。
//
// **取り込みの時点で取る**（確定の時ではなく）。レシートに通貨と日付が書いて
// あるので確実で、1通につき1回で済む。取り込んだ時点ではまだ旅行が決まって
// いないことがあり default_currency が分からないので、**その通貨を基準にした
// 主要通貨への表**をまるごと持っておく（1回の呼び出しで返る。確定の瞬間に
// 旅行の精算通貨で引く）。
//
// 提供元は Frankfurter（ECB のデータ・キー不要・履歴あり）。休日や週末の日付を
// 投げると直近の営業日のレートを返し、どの日付を使ったかも返す。

const BASE_URL = "https://api.frankfurter.dev/v1";

export type FxRates = {
  /** 実際に使われた日付（休日を投げると直近の営業日にずれる） */
  date: string;
  /** 基準通貨（レシートの通貨） */
  base: string;
  /** 基準通貨1に対する各通貨の量 */
  rates: Record<string, number>;
};

// 同じ (通貨, 日付) は1回だけ引く。1通のメールに複数のレシートがある場合や、
// 同じ日のレシートが連続で届く場合に効く。
const cache = new Map<string, FxRates | null>();

/**
 * その日・その通貨基準のレート表。取れなければ null（機能の前提ではないので
 * 落ちない。呼び出し側は今までどおり「レートが決められない」に倒す）。
 */
export async function fetchFxRates(
  base: string,
  date: string,
): Promise<FxRates | null> {
  if (!/^[A-Z]{3}$/.test(base) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const key = `${base}:${date}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let result: FxRates | null = null;
  try {
    const res = await fetch(`${BASE_URL}/${date}?base=${base}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const json: unknown = await res.json();
      const o = json as { date?: unknown; base?: unknown; rates?: unknown };
      if (
        typeof o.date === "string" &&
        typeof o.base === "string" &&
        o.rates &&
        typeof o.rates === "object"
      ) {
        const rates: Record<string, number> = {};
        for (const [c, v] of Object.entries(o.rates as Record<string, unknown>))
          if (typeof v === "number" && Number.isFinite(v) && v > 0) rates[c] = v;
        if (Object.keys(rates).length > 0)
          result = { date: o.date, base: o.base, rates };
      }
    }
  } catch {
    // 取れないだけ。取り込み自体は続ける。
  }
  cache.set(key, result);
  return result;
}

/** レート表から目的の通貨への換算レート。基準と同じなら 1。無ければ null。 */
export function rateTo(
  fx: FxRates | null | undefined,
  currency: string,
): number | null {
  if (!fx) return null;
  if (fx.base === currency) return 1;
  const r = fx.rates[currency];
  return typeof r === "number" && r > 0 ? r : null;
}
