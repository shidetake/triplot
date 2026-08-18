// 表示名の長さ上限（文字数）。
//
// 「旅行内の表示名」（trip_members.display_name）と「既定の表示名」
// （users.display_name）で同じ上限を使う。前者は予定ブロック・費用行・
// メンバーチップなど狭い場所に並ぶので、長すぎると切り詰めばかりになる。
// 後者は前者の初期値になるだけなので、別の上限を持つ理由がない。
//
// 入力欄の maxLength と、書き込み前の検証の両方でこの値を使う
// （検証メッセージは validation.nameTooLong）。
export const DISPLAY_NAME_MAX = 32;
