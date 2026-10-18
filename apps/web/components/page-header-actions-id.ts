// ヘッダーのバーの、ページ固有の操作の差し込み口の id。サーバーで描く
// app-header.tsx とクライアントの page-header-actions.tsx の両方が使うので、
// "use client" の無いここに置く（"use client" のファイルから値を import すると、
// サーバー側では値ではなくクライアント参照になる）。
export const PAGE_HEADER_ACTIONS_ID = "page-header-actions";
