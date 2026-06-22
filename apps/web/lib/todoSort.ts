// TODO の並び順:
//  1. 未チェックを上・チェック済みを下
//  2. それぞれの中で優先度（高→中→低）
//  3. 同じ優先度内は作成順（古い→新しい）
// → 未チェックの高/中/低 が並び、その下にチェック済みの高/中/低 が並ぶ。
// DB の priority は text なので素直に order できない。並びはここで一元化し、
// サーバ（page）とクライアント（楽観更新後の再ソート）の双方で同じ関数を使う。
import type { TodoPriority } from "@/lib/types/database";

export type SortableTodo = {
  priority: TodoPriority;
  done: boolean;
  created_at: string;
};

const PRIORITY_RANK: Record<TodoPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function sortTodos<T extends SortableTodo>(todos: readonly T[]): T[] {
  return [...todos].sort((a, b) => {
    // 未チェックを上、チェック済みを下
    if (a.done !== b.done) return a.done ? 1 : -1;
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    return a.created_at.localeCompare(b.created_at);
  });
}
