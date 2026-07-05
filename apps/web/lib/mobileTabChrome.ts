// 狭い画面（タブ化したモバイル）のクロムの実測オフセット。全画面ブリードする
// タブコンテンツ（予定のカレンダー・場所の地図）を position:fixed で直接
// 配置する時の top/bottom に使う単一の真実。
//
// TOP: AppHeader (h-12=48px + border 1px = 49px) + 圧縮ヘッダー
//      (h-11=44px + border 1px = 45px) = 94px
// BOTTOM: 下部タブバーの実測高(58px) + セーフエリア
//
// 地図(Google Maps JS)は、コンテナの高さが h-full の多段継承（fixed祖先 →
// h-full section → relative div → absolute inset-0 → h-full）で決まると、
// 実機で初期化タイミングと噛み合わず何も描画されない不具合が起きた
// （実機検証で発覚）。そのため full-bleed にするタブコンテンツ自身に
// 直接 fixed + top/bottom を当て、中間の h-full 継承段を作らない。
export const MOBILE_TAB_TOP_OFFSET = "94px";
export const MOBILE_TAB_BOTTOM_OFFSET = "calc(58px + env(safe-area-inset-bottom))";
