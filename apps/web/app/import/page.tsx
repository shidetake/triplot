import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/app-header";
import { ImportInbox } from "@/components/import-inbox";
import { buildCopySourceLabels } from "@triplot/shared/copySourceLabel";
import { deriveInboxRows } from "@triplot/shared/import/inboxRows";
import { buildImportAddress } from "@/lib/import/inboundAddress";
import { fetchImportInboxRows } from "@triplot/shared/data/reads/inbox";
import { createClient } from "@/lib/supabase/server";

// 取り込み受信箱のページ。中身はヘッダーから開くシート（import-sheet.tsx）と
// 共通の ImportInbox。メールのリンクや直リンクで来た時の入口として残してある
// （アプリ内からはヘッダーのシートで開く＝元の画面を失わない）。
export default async function ImportPage() {
  const t = await getTranslations("import");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // 読み取りクエリは shared（RN の受信箱と共用）。
  const raw = await fetchImportInboxRows(supabase, user.id);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("heading")}
        </h1>
        <div className="mt-3">
          <ImportInbox
            data={{
              importAddress: raw.importToken
                ? buildImportAddress(raw.importToken)
                : null,
              trips: raw.trips,
              // 同名旅行を見分けやすいよう "Hawaii (2026, 7日間)" の形にする
              // （create-trip のコピー元選択と同じ関数）。
              tripLabel: buildCopySourceLabels(raw.trips),
              rows: deriveInboxRows(raw),
              errorRows: raw.errorRows ?? [],
              usedThisMonth: raw.usedThisMonth ?? 0,
              overQuota: raw.overQuota ?? 0,
            }}
          />
        </div>
      </main>
    </>
  );
}
