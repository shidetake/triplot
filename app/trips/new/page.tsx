import { redirect } from "next/navigation";

import { CreateTripForm } from "@/components/create-trip-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewTripPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <h1 className="text-2xl font-semibold">新しい旅行を作る</h1>
      <p className="mt-2 text-sm text-zinc-600">
        基本情報だけ先に決めてください。あとから変更できます。
      </p>
      <CreateTripForm
        userId={user.id}
        defaultDisplayName={profile?.display_name ?? null}
      />
    </main>
  );
}
