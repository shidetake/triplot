import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("join");

  if (!title) {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-20">
        <h1 className="text-2xl font-semibold">{t("invalidTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("invalidBody")}</p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-blue-600 hover:underline"
        >
          {t("toTop")}
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
      <p className="text-sm text-muted-foreground">{t("invitedTo")}</p>
      <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("enterName")}</p>

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
