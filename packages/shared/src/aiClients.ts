// AI（MCP のクライアント）が自分で登録した名前を、利用者が使っている AI の
// 名前に直す。登録の名前は AI 側が名乗るもので、会社名で名乗るものがある
// （Gemini は "Google" と名乗る。実際の連携で確認）。案内のページの
// 「連携方法」には AI の名前で並べているので、「連携している AI」や許可の
// 画面でも同じ名前で出す（名前が食い違うと、どれがどれか分からない）。
//
// 名乗りを直すだけで、相手を確かめるものではない（許可の画面は戻り先の
// ドメインも出している）。
const BY_REGISTERED_NAME: Record<string, string> = {
  google: "Gemini",
};

export function aiClientName(registered: string | null | undefined): string | null {
  const name = registered?.trim();
  if (!name) return null;
  return BY_REGISTERED_NAME[name.toLowerCase()] ?? name;
}
