"use client";

import { useActionState } from "react";

import {
  createTripAction,
  type CreateTripState,
} from "@/app/trips/create-trip-action";

import { DateRangeCalendar } from "./date-range-calendar";

type Currency = "JPY" | "USD";

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "JPY", label: "JPY (¥)" },
  { value: "USD", label: "USD ($)" },
];

const initialState: CreateTripState = { error: null };

export function CreateTripForm({
  defaultDisplayName,
  onDone,
}: {
  defaultDisplayName?: string | null;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    createTripAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-md border border-zinc-200 bg-white p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">新しい旅行を作る</h3>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          閉じる
        </button>
      </div>

      <Field label="タイトル" name="title" required placeholder="ハワイ旅行" />
      <Field
        label="あなたの表示名（旅行内）"
        name="display_name"
        required
        defaultValue={defaultDisplayName ?? ""}
      />
      <div className="text-sm">
        <span className="font-medium">日程</span>
        <div className="mt-1">
          <DateRangeCalendar startName="start_date" endName="end_date" />
        </div>
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
        className="h-9 w-full rounded-md bg-black text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
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
    <label className="block min-w-0 text-sm">
      <span className="font-medium">{label}</span>
      <input
        {...rest}
        type={type}
        name={name}
        className="mt-1 block w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
      />
    </label>
  );
}
