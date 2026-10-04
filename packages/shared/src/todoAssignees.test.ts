import { describe, expect, it } from "vitest";

import {
  canCompleteTodo,
  isTodoDone,
  stackOrder,
  todoAssignment,
  todoProgress,
  toggleAssignee,
  type TodoMemberLite,
} from "./todoAssignees";

const members: TodoMemberLite[] = [
  { id: "a", active: true, hasAccount: true },
  { id: "b", active: true, hasAccount: true },
  { id: "c", active: true, hasAccount: true },
  { id: "left", active: false, hasAccount: true },
  { id: "gone", active: true, hasAccount: false },
];

describe("todoAssignment", () => {
  it("全員は在籍していてアカウントのある人に解決する", () => {
    const a = todoAssignment(
      { assigneeEveryone: true, assigneeIds: [], completedIds: ["a"] },
      members,
    );
    expect(a.mode).toBe("everyone");
    expect(a.requiredIds).toEqual(["a", "b", "c"]);
    expect(todoProgress(a)).toEqual({ done: 1, total: 3 });
  });

  it("一部は抜けた人を数えないが、選ばれた人としては残す", () => {
    const a = todoAssignment(
      { assigneeEveryone: false, assigneeIds: ["b", "left"], completedIds: [] },
      members,
    );
    expect(a.mode).toBe("some");
    expect(a.selectedIds).toEqual(["b", "left"]);
    expect(a.requiredIds).toEqual(["b"]);
  });

  it("担当が空なら未定", () => {
    const a = todoAssignment(
      { assigneeEveryone: false, assigneeIds: [], completedIds: [] },
      members,
    );
    expect(a.mode).toBe("none");
    expect(canCompleteTodo(a, "c")).toBe(true);
  });
});

describe("canCompleteTodo", () => {
  it("一部は担当だけ、全員は在籍メンバーだけ", () => {
    const some = todoAssignment(
      { assigneeEveryone: false, assigneeIds: ["a"], completedIds: [] },
      members,
    );
    expect(canCompleteTodo(some, "a")).toBe(true);
    expect(canCompleteTodo(some, "b")).toBe(false);
    const all = todoAssignment(
      { assigneeEveryone: true, assigneeIds: [], completedIds: [] },
      members,
    );
    expect(canCompleteTodo(all, "b")).toBe(true);
    expect(canCompleteTodo(all, "left")).toBe(false);
  });
});

describe("stackOrder", () => {
  it("まだの人を先に、やった人を後ろに並べる", () => {
    const a = todoAssignment(
      { assigneeEveryone: false, assigneeIds: ["a", "b", "c"], completedIds: ["a"] },
      members,
    );
    expect(stackOrder(a)).toEqual([
      { id: "b", done: false },
      { id: "c", done: false },
      { id: "a", done: true },
    ]);
  });
});

describe("toggleAssignee", () => {
  it("全員の時にタップすると、その人を外した一部になる", () => {
    const a = todoAssignment(
      { assigneeEveryone: true, assigneeIds: [], completedIds: [] },
      members,
    );
    expect(toggleAssignee(a, "b")).toEqual({ everyone: false, memberIds: ["a", "c"] });
  });

  it("一部の最後の1人を外すと未定（空）になる", () => {
    const a = todoAssignment(
      { assigneeEveryone: false, assigneeIds: ["a"], completedIds: [] },
      members,
    );
    expect(toggleAssignee(a, "a")).toEqual({ everyone: false, memberIds: [] });
    expect(toggleAssignee(a, "b")).toEqual({ everyone: false, memberIds: ["a", "b"] });
  });
});

describe("isTodoDone", () => {
  it("未定は誰か1人、一部・全員は担当の全員がやれば完了", () => {
    const none = todoAssignment(
      { assigneeEveryone: false, assigneeIds: [], completedIds: ["c"] },
      members,
    );
    expect(isTodoDone(none)).toBe(true);
    const some = todoAssignment(
      { assigneeEveryone: false, assigneeIds: ["a", "b"], completedIds: ["a"] },
      members,
    );
    expect(isTodoDone(some)).toBe(false);
    const all = todoAssignment(
      { assigneeEveryone: true, assigneeIds: [], completedIds: ["a", "b", "c"] },
      members,
    );
    // 抜けた人・退会した人は数えない。
    expect(isTodoDone(all)).toBe(true);
  });

  it("担当が全員いなくなったら、誰かがやっていれば完了", () => {
    const gone = todoAssignment(
      { assigneeEveryone: false, assigneeIds: ["left"], completedIds: ["a"] },
      members,
    );
    expect(isTodoDone(gone)).toBe(true);
  });
});
