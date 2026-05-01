import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: trip, error } = await supabase
    .from("trips")
    .select("id, title, start_date, end_date, status, default_currency")
    .eq("id", tripId)
    .single();

  if (error || !trip) notFound();

  const { data: members } = await supabase
    .from("trip_members")
    .select("id, display_name, kind, color")
    .eq("trip_id", tripId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        ← 旅行一覧に戻る
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold">{trip.title}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {trip.start_date ?? "?"} 〜 {trip.end_date ?? "?"}・通貨:{" "}
          {trip.default_currency}・状態: {trip.status}
        </p>
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-700">メンバー</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {(members ?? []).map((m) => (
            <li
              key={m.id}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm"
            >
              <span>{m.display_name}</span>
              <span className="text-xs text-zinc-500">({m.kind})</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 grid gap-3 text-sm text-zinc-500">
        <p>TODO: 地図・ピン管理</p>
        <p>TODO: スケジュール（週ビュー）</p>
        <p>TODO: 費用入力・割り勘・個人支出サマリ</p>
        <p>TODO: 共有リンクの発行とゲスト参加</p>
      </section>
    </main>
  );
}
