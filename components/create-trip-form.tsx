"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createClient } from "@/lib/supabase/client";

type Currency = "JPY" | "USD";

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "JPY", label: "JPY (¥)" },
  { value: "USD", label: "USD ($)" },
];

export function CreateTripForm({
  userId,
  defaultDisplayName,
}: {
  userId: string;
  defaultDisplayName?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const title = (formData.get("title") as string).trim();
    const displayName = (formData.get("display_name") as string).trim();
    const startDate = (formData.get("start_date") as string) || null;
    const endDate = (formData.get("end_date") as string) || null;
    const defaultCurrency = formData.get("default_currency") as Currency;
    const usdToJpyRaw = formData.get("usd_to_jpy_rate") as string | null;
    const usdToJpy = usdToJpyRaw ? Number.parseFloat(usdToJpyRaw) : NaN;

    if (!title || !displayName) {
      setError("タイトルと表示名は必須です");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();

      // 1. trip 作成
      const { data: trip, error: tripError } = await supabase
        .from("trips")
        .insert({
          title,
          start_date: startDate,
          end_date: endDate,
          default_currency: defaultCurrency,
        })
        .select()
        .single();

      if (tripError || !trip) {
        setError(tripError?.message ?? "旅行の作成に失敗しました");
        return;
      }

      // 2. 自分を member として追加
      const { error: memberError } = await supabase
        .from("trip_members")
        .insert({
          trip_id: trip.id,
          user_id: userId,
          display_name: displayName,
          kind: "member",
        });

      if (memberError) {
        setError(`メンバー登録に失敗: ${memberError.message}`);
        return;
      }

      // 3. 為替レート（default_currency=JPY のときに USD レートを保存）
      if (defaultCurrency === "JPY" && Number.isFinite(usdToJpy) && usdToJpy > 0) {
        await supabase.from("trip_exchange_rates").insert({
          trip_id: trip.id,
          currency: "USD",
          rate_to_default: usdToJpy,
        });
      }

      router.push(`/trips/${trip.id}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <Field label="タイトル" name="title" required placeholder="ハワイ旅行" />
      <Field
        label="あなたの表示名（旅行内）"
        name="display_name"
        required
        defaultValue={defaultDisplayName ?? ""}
      />
      <div className="grid grid-cols-2 gap-4">
        <Field label="開始日" name="start_date" type="date" />
        <Field label="終了日" name="end_date" type="date" />
      </div>

      <label className="block text-sm">
        <span className="font-medium">通貨</span>
        <select
          name="default_currency"
          defaultValue="JPY"
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        >
          {CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <Field
        label="USD → JPY レート（為替の手動設定。後から変更可）"
        name="usd_to_jpy_rate"
        type="number"
        step="0.01"
        defaultValue="150"
      />

      <button
        type="submit"
        disabled={isPending}
        className="h-12 w-full rounded-md bg-black font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
      >
        {isPending ? "作成中..." : "作成する"}
      </button>

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
};

function Field({ label, name, type = "text", ...rest }: FieldProps) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        {...rest}
        type={type}
        name={name}
        className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
      />
    </label>
  );
}
