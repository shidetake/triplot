// テキスト入力・セレクト・入力風トリガの共通レシピ（design-guidelines「余白・サイズ」
// の入力欄行）。枠・背景・パディング・文字サイズ・focus を1ソース化する。
//
// レイアウト（`mt-1 block w-full`・`min-w-0`・`flex-1`・`pr-9` 等）は呼び出し側が
// 内容に合わせて足す:
//   <input className={`mt-1 block w-full ${inputClass}`} />
//   <input className={`mt-1 block w-full min-w-0 ${inputClass}`} />
export const inputClass =
  "rounded-md border border-foreground/20 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none";
