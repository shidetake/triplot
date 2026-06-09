import Link from "next/link";
import { redirect } from "next/navigation";

import { ImportAddress } from "@/components/import-address";
import { buildImportAddress } from "@/lib/receipt/inboundAddress";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // per-user の取り込みアドレス（無ければ発行）。
  const { data: importToken } = await supabase.rpc("ensure_import_token");
  const importAddress = importToken ? buildImportAddress(importToken) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">設定</h1>
        <Link
          href="/"
          className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
        >
          ← ホーム
        </Link>
      </header>

      <div className="mt-10 space-y-6">
        <section className="space-y-3 rounded-lg border border-zinc-200 p-5">
          <div>
            <h2 className="font-medium">レシート取り込み用アドレス</h2>
            <p className="mt-1 text-sm text-zinc-600">
              レシートメールをこのアドレス（あなた専用・固定）に転送すると、費用として
              取り込めます。
            </p>
          </div>
          {importAddress ? (
            <ImportAddress address={importAddress} />
          ) : (
            <p className="text-sm text-red-600">
              アドレスの取得に失敗しました。再読み込みしてください。
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
