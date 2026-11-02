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
//   開くことを確かめた）。ChatGPT と Gemini は連携の設定の画面まで（入力済みで
//   開く口が無い）。
// - copiesUrl: setup を開く前に接続先をコピーする（入力済みで開けない AI。開いた
//   先で貼るだけで済む。Claude は入力済みで開くので要らない）。
// - setupInBrowser: スマホでも setup をブラウザ（web 版）で開く。ChatGPT はアプリから
//   カスタムの MCP を足せない（実際に確認）が、普通に開くと iOS がアプリに渡すため。
// - chat: チャットで頼んで足す AI（Muse）。依頼文を受け取り、それを入れた状態の
//   チャットを開く URL を返す。Muse は muse.ai/chat?prompt= で、PC の web では依頼文
//   入りで開き、スマホではアプリが開く（/chat はアプリで開く対象。ただし依頼文は
//   入らない）。どちらでも貼れるよう、開く前に依頼文をコピーする。
// - help: 各社の公式の手順。
export type AiGuide = {
  key: "claude" | "gemini" | "chatgpt" | "muse";
  name: string;
  setup: ((mcpUrl: string) => string) | null;
  copiesUrl: boolean;
  setupInBrowser: boolean;
  chat: ((prompt: string) => string) | null;
  help: string | null;
};

// 並びはアルファベット順（何かを推しているように見せない）。
export const AI_GUIDES: readonly AiGuide[] = [
  {
    key: "chatgpt",
    name: "ChatGPT",
    setup: () => "https://chatgpt.com/plugins",
    copiesUrl: true,
    setupInBrowser: true,
    chat: null,
    help: "https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt",
  },
  {
    key: "claude",
    name: "Claude",
    setup: (url) =>
      `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Triplot&connectorUrl=${encodeURIComponent(url)}`,
    copiesUrl: false,
    setupInBrowser: false,
    chat: null,
    help: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
  },
  {
    key: "gemini",
    name: "Gemini",
    setup: () => "https://gemini.google.com/customize/connectors",
    copiesUrl: true,
    setupInBrowser: false,
    chat: null,
    help: "https://support.google.com/gemini/answer/17209137",
  },
  {
    key: "muse",
    name: "Muse",
    setup: null,
    copiesUrl: false,
    setupInBrowser: false,
    chat: (prompt) => `https://muse.ai/chat?prompt=${encodeURIComponent(prompt)}`,
    help: null,
  },
];
