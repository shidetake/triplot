import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ChevronIcon } from "@/components/icons";
import { mcpUrl } from "@/lib/mcp-url";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { createClient } from "@/lib/supabase/server";

import { DisconnectAiButton, McpUrl } from "./ai-client";

// AI につなぐ（MCP）の案内と、つないでいる AI の一覧・解除。要ログイン。
//
// ヘッダーから開くものは原則オーバーレイだが、ここはページにする。つなぎ方を
// 読みながら別のアプリ（AI の設定）へ行って戻ってくる、文書のような行き先なので
// （ui-guidelines「全画面表示を使う場面」）。AI ごとの手順は細部まで書かず各社の
// 公式の手順へリンクする（各社の画面はよく変わり、こちらで追いかけきれない）。
// 設計: docs/design/mcp.md

const AIS = [
  {
    key: "claude",
    name: "Claude",
    help: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
  },
  {
    key: "gemini",
    name: "Gemini",
    help: "https://support.google.com/gemini/answer/17209137",
  },
  {
    key: "chatgpt",
    name: "ChatGPT",
    help: "https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt",
  },
  { key: "muse", name: "Meta Muse", help: null },
] as const;

export default async function AiPage() {
  const user = await getAuthUser();
  if (!user) redirect("/");

  const [t, locale, h] = await Promise.all([
    getTranslations("ai"),
    getLocale(),
    headers(),
  ]);
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const url = mcpUrl(`${proto}://${host}`);

  // ゲスト（匿名のセッション）は端末に閉じたものなので AI につなげない
  // （許可の画面もログインを求める）。
  const supabase = await createClient();
  const { data: grants } = user.isAnonymous
    ? { data: [] }
    : await supabase.auth.oauth.listGrants();
  const date = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("lead")}</p>

        <div className="mt-6">
          <McpUrl url={url} />
        </div>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold">{t("howTo")}</h2>
          <p className="text-sm text-muted-foreground">{t("howToLead")}</p>
          <div className="divide-y divide-foreground/10 rounded-lg border border-foreground/10">
            {AIS.map((ai) => (
              <details key={ai.key} className="group px-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  {ai.name}
                  <ChevronIcon
                    size={16}
                    className="text-muted-foreground transition group-open:rotate-90"
                  />
                </summary>
                <div className="space-y-2 pb-4 text-sm">
                  <ol className="list-decimal space-y-1 pl-5">
                    {(t.raw(`${ai.key}Steps`) as string[]).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <p className="text-xs text-muted-foreground">
                    {t(`${ai.key}Note`)}
                  </p>
                  {ai.help && (
                    <a
                      href={ai.help}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {t("officialHelp")}
                    </a>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold">{t("examplesTitle")}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {(t.raw("examples") as string[]).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold">{t("connectedTitle")}</h2>
          {!grants || grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("connectedEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-foreground/10 rounded-lg border border-foreground/10">
              {grants.map((g) => (
                <li
                  key={g.client.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {g.client.name || g.client.id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("connectedSince", {
                        date: date.format(new Date(g.granted_at)),
                      })}
                    </div>
                  </div>
                  <DisconnectAiButton
                    clientId={g.client.id}
                    name={g.client.name || g.client.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold">{t("noteTitle")}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {(t.raw("notes") as string[]).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
