// 地図に置く場所ピンの重なり順（奥 → 手前）。web と RN が同じ順位を見る。
//
// 守りたいこと:
//   1. **確定した場所を手前に出す。未確定（候補）は必ずその奥。** 候補は
//      まだ行くと決まっていないので、確定した場所を覆い隠してはいけない。
//   2. 同じ段の中は Google の既定に合わせる ——「画面上で下にあるピン
//      （＝緯度が低いピン）ほど手前」。ズームや中心からの距離では動かない
//      静的なルール（@types/google.maps の AdvancedMarkerElementOptions.zIndex
//      のコメント）。
//   3. 引き分けはいつも同じ側が勝つ。座標まで完全に一致する2件（実例:
//      英語表記とローカル表記で別々の Google Place として登録された
//      「Hanauma Bay」「ハナウマ湾」）は、既定ルールにとっても引き分けで
//      解決方法が規定されておらず、任せると描画のたびに入れ替わってチラつく。
//
// **返すのは緯度そのものではなく整数の順位**。zIndex は最終的にどちらの
// プラットフォームでも整数になる（iOS は AIRGoogleMapMarker.m の setZIndex:
// が NSInteger へキャスト、web の CSS z-index は整数しか受け付けない）ので、
// 「緯度の小数部で並べ、極小値で引き分けを解く」書き方は静かに効かなくなる。
// 順位にしておけば 1 以上の差が必ず残る。

export type StackablePlace = {
  id: string;
  lat: number | null;
  tentative: boolean;
};

// 奥から手前へ 0, 1, 2… を振る。呼び出し側は自分の下駄を足して zIndex にする
// （例: `-1000 + rank`）。件数分の幅しか使わないので、下駄の間隔より件数が
// 多くならない限り他のマーカーの段を追い越さない。
export function markerStackRanks(
  places: readonly StackablePlace[],
): Map<string, number> {
  const sorted = [...places].sort(compareStack);
  return new Map(sorted.map((p, i) => [p.id, i]));
}

// 奥にあるものほど小さい。
function compareStack(a: StackablePlace, b: StackablePlace): number {
  // 1. 未確定は確定より奥。
  if (a.tentative !== b.tentative) return a.tentative ? -1 : 1;
  // 2. 緯度が高い（北＝画面上で上）ほど奥。座標を持たない場所は地図に出ない
  //    ので、順位を消費するだけの最奥に置く。
  const la = a.lat ?? Number.POSITIVE_INFINITY;
  const lb = b.lat ?? Number.POSITIVE_INFINITY;
  if (la !== lb) return lb - la;
  // 3. 引き分けは id 昇順で固定する。
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
