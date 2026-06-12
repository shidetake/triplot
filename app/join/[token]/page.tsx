import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import { JoinForm } from "./join-form";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken);

  const supabase = await createClient();

  // peek_invite は anon 可。トークンを知っている人だけが旅行名を見られる。
  const { data: title } = await supabase.rpc("peek_invite", {
    p_token: token,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!title) {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-20">
        <h1 className="text-xl font-semibold">無効な招待リンクです</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          リンクが間違っているか、無効化された可能性があります。
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-blue-600 hover:underline"
        >
          トップへ
        </Link>
      </main>
    );
  }

  const defaultName =
    (!user?.is_anonymous &&
      ((user?.user_metadata?.name as string | undefined) ?? "")) ||
    "";

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <p className="text-sm text-muted-foreground">旅行に招待されています</p>
      <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        名前を入れて参加してください。ゲスト参加ならアカウント登録は不要です。
      </p>

      <div className="mt-8">
        <JoinForm
          token={token}
          defaultName={defaultName}
          hasSession={!!user}
        />
      </div>
    </main>
  );
}
