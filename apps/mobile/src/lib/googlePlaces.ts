// Google Places API (New) 呼び出しに必要な共通定数。地図タブの検索と、予定/費用
// フォームの場所欄サジェスト（place-picker.tsx）の両方から使う。
// 未設定は "" に畳んで string に固定する。呼び出し側は全て `!PLACES_API_KEY` で
// 未設定を弾いており（空文字も falsy なので挙動は同じ）、型を `string | undefined`
// のままにすると setTimeout 等のコールバック内で絞り込みが失われて型エラーになる。
export const PLACES_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? "";
export const BUNDLE_ID = "app.triplot.mobile";
