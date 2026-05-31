"use client";

import { useActionState, useState } from "react";

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

// コピー元に選べる過去の旅行。
export type CopyableTrip = {
  id: string;
  title: string;
  default_currency: string;
};

const initialState: CreateTripState = { error: null };

export function CreateTripForm({
  defaultDisplayName,
  trips,
  onDone,
}: {
  defaultDisplayName?: string | null;
  trips: CopyableTrip[];
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    createTripAction,
    initialState,
  );

  const canCopy = trips.length > 0;
  const [mode, setMode] = useState<"new" | "copy">("new");
  const [sourceId, setSourceId] = useState("");
  // タイトル・通貨はコピー元選択時にプリフィルしたいので制御する。
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState<Currency>("JPY");

  const pickSource = (id: string) => {
    setSourceId(id);
    const t = trips.find((x) => x.id === id);
    if (t) {
      setTitle(t.title);
      if (t.default_currency === "JPY" || t.default_currency === "USD") {
        setCurrency(t.default_currency);
      }
    }
  };

  const radio =
    "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition";

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

      {/* 作り方の選択（過去の旅行が無ければ出さない） */}
      {canCopy && (
        <div className="flex gap-2">
          <label
            className={`${radio} ${
              mode === "new"
                ? "border-black bg-black text-white"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <input
              type="radio"
              name="__mode"
              className="sr-only"
              checked={mode === "new"}
              onChange={() => {
                setMode("new");
                setSourceId("");
              }}
            />
            ゼロから
          </label>
          <label
            className={`${radio} ${
              mode === "copy"
                ? "border-black bg-black text-white"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <input
              type="radio"
              name="__mode"
              className="sr-only"
              checked={mode === "copy"}
              onChange={() => setMode("copy")}
            />
            過去の旅行をコピー
          </label>
        </div>
      )}

      {mode === "copy" && (
        <label className="block text-sm">
          <span className="font-medium">
            コピー元<span className="ml-0.5 font-normal text-red-500">*</span>
          </span>
          <select
            value={sourceId}
            onChange={(e) => pickSource(e.target.value)}
            required={mode === "copy"}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
          >
            <option value="" disabled>
              旅行を選択
            </option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* コピー時のみ source_trip_id を送る */}
      <input
        type="hidden"
        name="source_trip_id"
        value={mode === "copy" ? sourceId : ""}
      />

      <label className="block min-w-0 text-sm">
        <span className="font-medium">
          タイトル<span className="ml-0.5 font-normal text-red-500">*</span>
        </span>
        <input
          name="title"
          required
          placeholder="ハワイ旅行"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        />
      </label>

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
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
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

      {mode === "copy" && (
        <p className="text-xs leading-snug text-zinc-500">
          場所と「全員参加」の予定をコピーします（費用は除く）。日数が違う場合は
          両端を優先し、はみ出す中日の予定は省かれます。
        </p>
      )}

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
