// AI Gateway の残高照会。
//
// 目的は診断であって制御ではない。抽出が失敗したときに「レート制限に張り付いて
// いるのか、クレジットが尽きたのか」を後から切り分けられるよう、残高をログに
// 残す。この2つは質が違う（前者は時間で解ける・後者は入金しないと解けない）のに、
// エラーの文面だけでは区別が付かないため。
//
// 制御に使っていないのは、**クレジット枯渇時にどんなエラーが返るかをまだ観測して
// いない**から。ステータスコードで分類する classifyFailure が入ったことで、402 でも
// 429 でも事故にはならない（402 なら即保留、429 なら毎分再試行して入金時に自動復旧）。
// 実際の形を見てから専用処理を足す。

const CREDITS_URL = "https://ai-gateway.vercel.sh/v1/credits";

export type GatewayCredits = { balance: number; totalUsed: number };

// キー未設定・通信失敗・想定外のレスポンスはすべて null（診断が取れないだけで、
// 取り込みの動作には影響させない）。
export async function fetchGatewayCredits(): Promise<GatewayCredits | null> {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(CREDITS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (typeof json !== "object" || json === null) return null;
    const { balance, total_used: totalUsed } = json as Record<string, unknown>;
    const b = Number(balance);
    const t = Number(totalUsed);
    if (!Number.isFinite(b)) return null;
    return { balance: b, totalUsed: Number.isFinite(t) ? t : 0 };
  } catch {
    return null;
  }
}
