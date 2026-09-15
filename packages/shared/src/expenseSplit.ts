// 費用の「割り勘対象」から、保存する3つの値を決める（純関数）。
//
// **誰も借りが生まれないのは、払った人が自分のためだけに払った時だけ。**
// その時に限って splittable=false で保存する＝精算の対象から外れる
// （tripDerive.toSettlementExpenses が splittable で絞る）。
//
// 以前はこの判定を web と iOS が別々に持っていて、どちらも「払った人」では
// なく**見ている人**で判定していた。そのため「他の人が自分のためだけに
// 払った」費用が「割り勘しない」として保存され、一覧にも出ず精算からも
// 消えていた（借りがあるのに 0 円として扱われる）。お金に効く判定なので、
// 1つに寄せてテストで固定する。

export type SplitSubmission = {
  splittable: boolean;
  splitEveryone: boolean;
  splitMemberIds: string[];
};

export function deriveSplitSubmission(a: {
  visibility: "shared" | "private";
  // 払った人。**見ている人ではない。**
  payerMemberId: string;
  // 画面で選ばれている割り勘対象。
  selectedMemberIds: string[];
  // 「全員」を選んでいるか（true なら具体的な ID を焼き込まない＝後から
  // 加わった人も含まれる）。
  everyone: boolean;
}): SplitSubmission {
  // private は自分にしか見えない＝割り勘できない（DB の CHECK 制約と同じ）。
  const onlyPayer =
    a.selectedMemberIds.length === 1 &&
    a.selectedMemberIds[0] === a.payerMemberId;
  const splittable = a.visibility === "shared" && !onlyPayer;
  const splitEveryone = !splittable || a.everyone;
  return {
    splittable,
    splitEveryone,
    splitMemberIds: splitEveryone ? [] : [...a.selectedMemberIds],
  };
}
