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

// 保存された3つの値から、フォームの選択状態に戻す（deriveSplitSubmission の逆）。
//
// **splittable=false のとき split_everyone は true で保存される**（割り勘しない
// ので「全員かどうか」は意味を持たない）。なので split_everyone だけを見て
// モードを決めると、「自分のためだけに払った」費用を開き直したときに
// 「割り勘対象: 全員」に化ける。そこから支払者を変えるなどして保存すると、
// 本当に全員の割り勘になってしまう。
//
// 保存と復元が別々の場所に散ると必ずこうずれるので、逆写像もここに置く。

export type SplitSelection = {
  mode: "all" | "custom";
  selectedMemberIds: string[];
};

export function deriveSplitSelection(a: {
  splittable: boolean;
  splitEveryone: boolean;
  // splitEveryone=false のときだけ意味を持つ、明示的に選ばれた対象。
  splitMemberIds: string[];
  payerMemberId: string;
  // 「全員」は具体的な ID を持たないので、開いた時点のアクティブメンバーに
  // 解決する（後から加わった人もここに現れる）。
  activeMemberIds: string[];
}): SplitSelection {
  if (!a.splittable) {
    return { mode: "custom", selectedMemberIds: [a.payerMemberId] };
  }
  if (a.splitEveryone) {
    return { mode: "all", selectedMemberIds: [...a.activeMemberIds] };
  }
  return { mode: "custom", selectedMemberIds: [...a.splitMemberIds] };
}
