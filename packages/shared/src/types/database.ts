// DB の型は database.generated.ts（`npm run db:types` で実 DB から自動生成）が
// 単一の真実。手書きの取り違え事故を防ぐため、ここでは生成物を再 export するだけ。
//
// 利便用の union 別名（Currency など）はここで保守する。生成型は CHECK 制約を
// 読めず `string` になるため。

export type { Database, Json } from "./database.generated";

// ISO 4217 の 3 文字コード（"JPY" / "USD" / "EUR" 等）。full list は currencies.ts。
export type Currency = string;
export type Visibility = "shared" | "private";
export type MemberKind = "member" | "guest";
export type TodoPriority = "high" | "medium" | "low";
export type TodoKind = "prep" | "onsite";
