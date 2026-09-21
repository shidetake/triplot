import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import {
  findJoinedTripByInvite,
  peekInvite,
} from "@triplot/shared/data/invites";
import { fetchUserProfile } from "@triplot/shared/data/reads/trips";
import { resolveLastAuthProvider } from "@/lib/lastAuthProvider.server";
import { createClient } from "@/lib/supabase/server";

import { HardRedirect } from "./hard-redirect";
import { JoinForm } from "./join-form";

// 招待を受け取って旅行を見る、という一点集中のタスク画面なので、Smart App
// Banner（root layout の generateMetadata が site-wide に出す）はここでは
// 抑制する。`other` は openGraph 等と違いキー単位でマージされる（親子で
// Object.assign）ので `other: {}` では消えない。同じキーを空文字で上書きすると
// レンダラーが空文字のタグを出力しないので、これで消える
// （node_modules/next/dist/lib/metadata/resolve-metadata.js の `case 'other'`
// と metadata.js の空文字チェック参照）。
export const metadata: Metadata = {
  other: {
    "apple-itunes-app": "",
  },
};

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken);

  const supabase = await createClient();

  // peek_invite は anon 可。トークンを知っている人だけが旅行名を見られる
  // （読み取りは shared＝RN の招待参加画面と共用）。
  const title = await peekInvite(supabase, token);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // **もう入っている旅行なら、参加画面は出さずにその旅行へ送る。**
  // 自分が共有したリンクを自分で踏む・同じリンクを2回踏む、はどちらも普通に
  // 起きる。判定は RLS に任せる（findJoinedTripByInvite のコメント参照）。
  //
  // next/navigation の redirect() は使わない（HTTP redirect であっても
  // Safari は Smart App Banner を出さないことを実機確認済み。HardRedirect
  // のコメント参照）。代わりにクライアント側で window.location.href する
  // <HardRedirect> をレンダーし、join フォーム自体は出さない。
  const joinedTripId = user
    ? await findJoinedTripByInvite(supabase, token)
    : null;

  if (joinedTripId) {
    return <HardRedirect to={`/trips/${joinedTripId}`} />;
  }

  const [t, lastAuthProvider] = await Promise.all([
    getTranslations("join"),
    resolveLastAuthProvider(),
  ]);

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

  // 表示名の初期値は**アカウントの既定表示名**（users.display_name）。設定画面が
  // 「旅行に参加するときのデフォルト表示名」と説明しているのはこの値で、旅行作成
  // フォームの初期値とも揃う。まだ何も入っていない時だけ、サインインの情報から
  // full_name → name の順で拾う（Google は両方入るが Apple は full_name のみ）。
  const profile =
    user && !user.is_anonymous
      ? await fetchUserProfile(supabase, user.id)
      : null;
  const defaultName =
    profile?.display_name?.trim() ||
    (!user?.is_anonymous &&
      ((user?.user_metadata?.full_name as string | undefined) ??
        (user?.user_metadata?.name as string | undefined) ??
        "")) ||
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
          lastAuthProvider={lastAuthProvider}
        />
      </div>
    </main>
  );
}
