// DB の型は database.generated.ts（`npm run db:types` で実 DB から自動生成）が
// 単一の真実。手書きの取り違え事故を防ぐため、ここでは生成物を再 export するだけ。
//
// 利便用の union 別名（Currency など）はここで保守する。生成型は CHECK 制約を
// 読めず `string` になるため。通貨は将来 JPY/USD 固定を外す予定（BACKLOG 参照）
// なので、その時はこの別名も通貨マスタ参照に置き換える。

export type { Database, Json } from "./database.generated";

export type Currency = "JPY" | "USD";
export type Visibility = "shared" | "private";
export type TripStatus = "planning" | "ongoing" | "finished";
export type MemberKind = "member" | "guest";
