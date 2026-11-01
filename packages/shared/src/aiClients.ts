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

// 「連携方法」に並べる AI と、それぞれの入口。web の /ai と iOS の AI 連携の
// シートの両方がこれを使う（二重に持つと片方だけ古くなる）。
//
// - setup: 1つ目の手順のリンク先（接続先の URL を受け取って作る）。Claude は
//   名前と接続先を入れた状態で追加の画面が開く（公式の説明は無いが、実際に
//   開くことを確かめた）。Gemini は連携の設定の画面まで。
// - prompt: チャットで頼んで足す AI（Muse）。頼む文をコピーするボタンを出す。
// - help: 各社の公式の手順。
export type AiGuide = {
  key: "claude" | "gemini" | "chatgpt" | "muse";
  name: string;
  setup: ((mcpUrl: string) => string) | null;
  prompt: boolean;
  help: string | null;
};

export const AI_GUIDES: readonly AiGuide[] = [
  {
    key: "claude",
    name: "Claude",
    setup: (url) =>
      `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=triplot&connectorUrl=${encodeURIComponent(url)}`,
    prompt: false,
    help: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
  },
  {
    key: "gemini",
    name: "Gemini",
    setup: () => "https://gemini.google.com/customize/connectors",
    prompt: false,
    help: "https://support.google.com/gemini/answer/17209137",
  },
  {
    key: "chatgpt",
    name: "ChatGPT",
    setup: null,
    prompt: false,
    help: "https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt",
  },
  { key: "muse", name: "Muse", setup: null, prompt: true, help: null },
];
