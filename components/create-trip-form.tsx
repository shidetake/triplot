"use client";

import { useActionState } from "react";

import {
  createTripAction,
  type CreateTripState,
} from "@/app/trips/new/actions";

type Currency = "JPY" | "USD";

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "JPY", label: "JPY (¥)" },
  { value: "USD", label: "USD ($)" },
];

const initialState: CreateTripState = { error: null };

export function CreateTripForm({
  defaultDisplayName,
}: {
  defaultDisplayName?: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    createTripAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 space-y-4">
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

      <button
        type="submit"
        disabled={isPending}
        className="h-12 w-full rounded-md bg-black font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
      >
        {isPending ? "作成中..." : "作成する"}
      </button>

      {state.error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {state.error}
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
