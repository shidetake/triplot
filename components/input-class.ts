// テキスト入力・セレクト・入力風トリガの共通レシピ（design-guidelines「余白・サイズ」
// の入力欄行）。枠・背景・パディング・文字サイズ・focus を1ソース化する。
//
// レイアウト（`mt-1 block w-full`・`min-w-0`・`flex-1`・`pr-9` 等）は呼び出し側が
// 内容に合わせて足す:
//   <input className={`mt-1 block w-full ${inputClass}`} />
//   <input className={`mt-1 block w-full min-w-0 ${inputClass}`} />
// 高さは固定 h-9（36px＝design-guidelines のコントロール高さ／shadcn の既定）。py-2 だと
// input と native select で実高さがズレる（select が低く描画される）うえ、iOS の 16px 強制
// フォントで膨らんで 36px から外れるため、固定高で全コントロールを 36px に揃える。
// 先頭の `input-control` は素のクラス名マーカー（Tailwind ではない）。globals.css の
// `@media (any-pointer: coarse)` がこれを拾い、入力風トリガ（button の日時チップ・場所
// ピッカー等）も実入力と同じ 16px に揃える（タッチ端末で周りより小さく見えるのを防ぐ）。
export const inputClass =
  "input-control h-9 rounded-md border border-foreground/20 bg-white px-3 text-sm focus:border-primary focus:outline-none";
