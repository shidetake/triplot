// TODO の担当と完了の規則。DB（20261003020000_todo_multi_assignees.sql の
// todo_is_done / can_complete_todo）と同じ規則を画面側でも使う。完了したか
// どうか（done）は DB が計算した値を読むが、「誰が担当で、誰がまだか」を
// 見せるにはこちらが要る。
//
// 担当は予定の参加者・費用の割り勘と同じ形:
//   未定 … 誰か1人がやれば完了
//   全員 … その時点の在籍メンバー全員（後から入った人も対象、抜けた人は外れる）
//   一部 … 選んだ人
// 数える対象からはアカウントを削除したメンバーを除く（もうチェックできない）。

export type TodoAssigneeMode = "none" | "everyone" | "some";

export type TodoMemberLite = {
  id: string;
  // 旅行に在籍しているか（left_at が無い）。
  active: boolean;
  // アカウントがあるか（退会したメンバーは false）。
  hasAccount: boolean;
};

export type TodoAssignment = {
  mode: TodoAssigneeMode;
  // 一部のときに選ばれている人（抜けた人も含む。選択の画面で今の値として見せる）。
  selectedIds: string[];
  // やるべき人（全員なら在籍メンバー、一部なら選ばれた人のうち在籍している人。
  // どちらもアカウントのある人だけ）。未定なら空。
  requiredIds: string[];
  // やった人。
  completedIds: string[];
};

export function todoAssignment(
  raw: {
    assigneeEveryone: boolean;
    assigneeIds: readonly string[];
    completedIds: readonly string[];
  },
  members: readonly TodoMemberLite[],
): TodoAssignment {
  const countable = (m: TodoMemberLite) => m.active && m.hasAccount;
  const byId = new Map(members.map((m) => [m.id, m]));
  const completedIds = [...raw.completedIds];
  if (raw.assigneeEveryone) {
    return {
      mode: "everyone",
      selectedIds: [],
      requiredIds: members.filter(countable).map((m) => m.id),
      completedIds,
    };
  }
  if (raw.assigneeIds.length === 0) {
    return { mode: "none", selectedIds: [], requiredIds: [], completedIds };
  }
  return {
    mode: "some",
    selectedIds: [...raw.assigneeIds],
    requiredIds: raw.assigneeIds.filter((id) => {
      const m = byId.get(id);
      return m ? countable(m) : false;
    }),
    completedIds,
  };
}

/** その人がチェックしてよいか（未定なら誰でも、それ以外は担当だけ）。 */
export function canCompleteTodo(a: TodoAssignment, memberId: string): boolean {
  if (a.mode === "none") return true;
  if (a.mode === "everyone") return a.requiredIds.includes(memberId);
  return a.selectedIds.includes(memberId);
}

/** 進み具合。やるべき人のうち、やった人の数。 */
export function todoProgress(a: TodoAssignment): { done: number; total: number } {
  const done = a.requiredIds.filter((id) => a.completedIds.includes(id)).length;
  return { done, total: a.requiredIds.length };
}

/**
 * 行に並べるアバターの順番。まだの人を先（左・手前）、やった人を後ろ。
 * 同じ組の中は渡された順（＝メンバーの並び）を保つ。
 */
export function stackOrder(a: TodoAssignment): { id: string; done: boolean }[] {
  const ids = a.mode === "some" ? a.selectedIds : a.requiredIds;
  const done = new Set(a.completedIds);
  return [
    ...ids.filter((id) => !done.has(id)).map((id) => ({ id, done: false })),
    ...ids.filter((id) => done.has(id)).map((id) => ({ id, done: true })),
  ];
}

/**
 * 選択の画面でメンバーをタップした時の次の担当。
 *   全員の時にタップ → その人を外した「一部」（全員 − その人）
 *   それ以外 → その人を足す／外す。誰もいなくなったら未定。
 */
export function toggleAssignee(
  a: TodoAssignment,
  memberId: string,
): { everyone: boolean; memberIds: string[] } {
  if (a.mode === "everyone") {
    const rest = a.requiredIds.filter((id) => id !== memberId);
    return { everyone: false, memberIds: rest };
  }
  const has = a.selectedIds.includes(memberId);
  const next = has
    ? a.selectedIds.filter((id) => id !== memberId)
    : [...a.selectedIds, memberId];
  return { everyone: false, memberIds: next };
}
