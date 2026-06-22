// メニュー/ドロップダウンの「選択行」の共通レシピ（ui-guidelines「定型部品」）。
// 浮遊パネル（アカウント/⋯メニュー・セレクト・オートコンプリート候補・チェック
// リスト等）に並ぶ選択可能な行は、パディング・hover・文字サイズをこれで統一する。
//
// display（単一行は `flex items-center gap-2`、候補の2行表示は `block`）・幅以外の
// レイアウト・文字色（補助なら text-muted-foreground）・選択状態（`bg-accent
// font-medium`）は各メニューが内容に合わせて足す:
//
//   <button className={`flex items-center gap-2 ${menuItemClass}`}>…</button>
//   <button className={`block ${menuItemClass} ${sel ? "bg-accent font-medium" : ""}`}>…</button>
export const menuItemClass =
  "w-full px-3 py-2 text-left text-sm transition hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
