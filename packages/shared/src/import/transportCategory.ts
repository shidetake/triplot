import type { TripTzTimeline } from "../schedule";

// 移動の費用を「渡航」と「現地移動」のどちらに入れるか。
//
// **1通のメールだけでは決まらない。** 「京都 → 東京」の新幹線が、旅行先へ
// 向かう行程の一部なのか、国内旅行の中の移動なのかは、そのメールに書いて
// いない。旅行の他の予定まで見て初めて決まる。LLM は1通ずつ読むので、
// ここが構造的に弱い（実測: 帰国後の「品川 → 京都」を3回中1回しか渡航に
// できず、指示を足しても2回止まりだった）。
//
// 旅行全体の情報は TZ の年表が持っている。年表は**TZ が変わる移動だけ**を
// 境界として並べたもので（buildTripTzTimeline）、そこから2つが読める:
//
// - **年表が空 = TZ をまたがない旅行**。国内旅行の国内移動を渡航に倒さない
//   ためのガードになる（国内旅行では移動は現地移動のまま）。
// - **最初の境界の出発側 = 自国**。旅行はそこから始まってそこへ帰る。
//
// なので「TZ をまたぐ旅行で、自国側にいる時の移動」は行き帰りの一部＝渡航。
//
// **倒すのは現地移動 → 渡航の一方向だけ。** 逆（渡航 → 現地移動）はしない。
// 帰りの国際線は費用の場所が旅行先側（ホノルル）になるので、両方向にすると
// 正しい渡航を現地移動へ落としてしまう。
export function resolveTransportCategory(
  category: string | null | undefined,
  // その費用がどちらの TZ で発生したか（resolveExpenseTz の結果。移動日は
  // 場所の経度と時刻で1つに絞ってある）。
  expenseTz: string | null | undefined,
  tl: TripTzTimeline,
): string | null | undefined {
  if (category !== "現地移動") return category;
  const homeTz = tl.transits[0]?.departTz;
  if (!homeTz || !expenseTz) return category;
  return expenseTz === homeTz ? "渡航" : category;
}
