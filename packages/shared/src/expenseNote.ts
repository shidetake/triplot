// 費用の行で、メモをどこに出すか（純関数）。
//
// 行は「金額の段」「場所と支払者の段」「メモの段」でできている。場所を持たない
// 費用は場所の枠が空いたまま残り、そのぶんメモが下にもう1段ぶら下がる。空いて
// いる枠にメモを入れれば、同じ情報が1行少なく収まる（実機フィードバック）。
//
// web と iOS で同じ判定を二度書くと片方だけずれるので、ここに1つ置く。

export type ExpenseNoteSlot =
  // 場所の枠に出す（場所が無い費用）。
  | "place"
  // メモだけの段を足す（場所が既に枠を使っている）。
  | "own"
  // 出さない。
  | "none";

export function expenseNoteSlot(a: {
  placeName: string | null | undefined;
  note: string | null | undefined;
}): ExpenseNoteSlot {
  if (!a.note?.trim()) return "none";
  return a.placeName ? "own" : "place";
}
