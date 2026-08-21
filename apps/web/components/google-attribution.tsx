// 地図を伴わずに Google の場所データ（Places のサジェスト）を出す箇所の帰属表示。
//
// Google Maps Platform のポリシーは「Google マップを伴わずに Places のデータを
// 表示する場合は Google ロゴを入れること。狭ければ "Google Maps" のテキストでも
// 可」としている。候補リストの足元は狭いのでテキストを採る。
// 地図の上に出す候補（place-search）は地図自身の帰属表示があるので不要。
//
// ポリシーは「常に見えて読めること」も求めるので、**スクロールする候補リストの
// 内側ではなく外**に置いて、スクロールしても流れないようにする。
export function GoogleAttribution() {
  return (
    <div className="shrink-0 border-t border-foreground/10 px-2 py-1 text-right text-xs text-muted-foreground">
      Google Maps
    </div>
  );
}
