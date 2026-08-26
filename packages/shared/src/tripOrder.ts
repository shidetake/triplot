// 旅行一覧の並び順。
//
// **開始日の新しい順**（これから行く旅行 → 最近の旅行 → 昔の旅行）。一覧は
// 「どれを開くか選ぶ場所」なので、今の関心に近いものが先頭に来る。
//
// 旅行の中の費用・予定が時系列（古い順）なのと向きが逆になるが、これは
// 一覧と中身で役割が違うため。中身は1本の時間の流れを読むものなので前から
// 後ろへ進む。Gmail のスレッド一覧（新しい順）とスレッドの中身（古い順）と
// 同じ関係で、写真のアルバム一覧とアルバムの中身も同じ。
//
// 旅行の候補（仮旅行）も同じ一覧に並ぶので同じ順で並べる。

export type TripOrderKey = {
  // "YYYY-MM-DD"。日程が未設定なら null。
  start: string | null;
  title?: string | null;
};

export function compareTripOrder(a: TripOrderKey, b: TripOrderKey): number {
  // 日程が無い旅行は他と比べようがないので末尾へ。
  if (!a.start || !b.start) return (a.start ? 0 : 1) - (b.start ? 0 : 1);
  if (a.start !== b.start) return a.start < b.start ? 1 : -1;
  // 同じ日に始まる旅行は名前順（並びが入れ替わらないように決めておく）。
  return (a.title ?? "").localeCompare(b.title ?? "");
}
