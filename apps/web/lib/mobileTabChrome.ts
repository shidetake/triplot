// 狭い画面（タブ化したモバイル）のクロムの実測オフセット。全画面ブリードする
// タブコンテンツ（予定のカレンダー・場所の地図）を position:fixed で直接
// 配置する時の top/bottom に使う単一の真実。
//
// TOP: AppHeader (h-12=48px + border 1px = 49px) のみ。
//      以前はこの下にもう1本 圧縮ヘッダー(45px) を敷いていて 94px だったが、
//      ヘッダーを1本に統合したので 49px。**この値の更新を忘れると、畳んだぶんが
//      そのまま空白の帯として残る**（実機フィードバックで発覚）。
// BOTTOM: 下部タブバーの実測高(58px) + セーフエリア
//
// 地図(Google Maps JS)は、コンテナの高さが h-full の多段継承（fixed祖先 →
// h-full section → relative div → absolute inset-0 → h-full）で決まると、
// 実機で初期化タイミングと噛み合わず何も描画されない不具合が起きた
// （実機検証で発覚）。そのため full-bleed にするタブコンテンツ自身に
// 直接 fixed + top/bottom を当て、中間の h-full 継承段を作らない。
export const MOBILE_TAB_TOP_OFFSET = "49px";
export const MOBILE_TAB_BOTTOM_OFFSET = "calc(58px + env(safe-area-inset-bottom))";

// タブ化される狭い画面の判定（trip-detail-tabs.tsx の md ブレークポイントと同じ）。
// places-section.tsx（検索/地図/一覧のレイアウト切替）と place-map.tsx（地図ピンの
// フォームをポップアップ/ボトムシートどちらで出すか）で共有する単一の真実。
export const NARROW_SCREEN_QUERY = "(max-width: 767px)";
