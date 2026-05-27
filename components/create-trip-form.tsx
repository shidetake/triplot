"use client";

import { useActionState } from "react";

import {
  createTripAction,
  type CreateTripState,
} from "@/app/trips/create-trip-action";

import { DateRangePopover } from "./date-range-popover";
import { CloseIcon, PlusIcon } from "./icons";

type Currency = "JPY" | "USD";

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "JPY", label: "JPY 日本円" },
  { value: "USD", label: "USD 米ドル" },
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
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          aria-label="閉じる"
          className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
        >
          <CloseIcon size={14} />
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
          <DateRangePopover
            startName="start_date"
            endName="end_date"
            required
          />
        </div>
      </div>

      <div className="text-sm">
        <div className="flex items-center gap-1">
          <label htmlFor="default_currency" className="font-medium">
            精算通貨
          </label>
          <span className="group relative inline-flex">
            <span
              tabIndex={0}
              role="img"
              aria-label="精算通貨とは"
              className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-600"
            >
              ?
            </span>
            <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 w-56 rounded-md bg-zinc-800 px-2 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              合計や割り勘の精算に使う通貨です（旅行先の通貨ではありません）
            </span>
          </span>
        </div>
        <select
          id="default_currency"
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
      </div>

      <button
        type="submit"
        disabled={isPending}
        aria-label="作成"
        title="作成"
        className="flex h-9 w-full items-center justify-center rounded-md bg-black font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
      >
        <PlusIcon size={20} />
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
      <span className="font-medium">
        {label}
        {rest.required && (
          <span className="ml-0.5 font-normal text-red-500">*</span>
        )}
      </span>
      <input
        {...rest}
        type={type}
        name={name}
        className="mt-1 block w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
      />
    </label>
  );
}
