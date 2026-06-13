"use client";

import { useActionState, useState } from "react";

import {
  createTripAction,
  type CreateTripState,
} from "@/app/trips/create-trip-action";

import { buildCopySourceLabels } from "@/lib/copySourceLabel";
import { tripDayCount } from "@/lib/tripCopy";

import { DateRangePopover } from "./date-range-popover";
import { HelpTip } from "./help-tip";
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
  start_date: string | null;
  end_date: string | null;
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
  // 選択中の日程（コピー元より短いかの判定に使う）。
  const [range, setRange] = useState<{
    start: string | null;
    end: string | null;
  }>({ start: null, end: null });

  // 同名旅行を見分けやすいよう "Hawaii (2026, 7日間)" の形にする。
  const copyLabels = buildCopySourceLabels(trips);

  // 新しい日程がコピー元より短いと、両端優先で中日の予定が省かれる。
  // そのケースだけ注意を出す。
  const source = trips.find((x) => x.id === sourceId);
  const sourceDays =
    source?.start_date && source.end_date
      ? tripDayCount(source.start_date, source.end_date)
      : null;
  const newDays =
    range.start && range.end ? tripDayCount(range.start, range.end) : null;
  const showShorterWarning =
    mode === "copy" &&
    sourceDays !== null &&
    newDays !== null &&
    newDays < sourceDays;

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

  // セグメントトラックの各セグメント（design-guidelines「定型部品」）。
  const seg =
    "flex flex-1 cursor-pointer items-center justify-center rounded px-2 py-1.5 text-xs font-medium transition";

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-md border border-foreground/10 bg-white p-4"
    >
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          aria-label="閉じる"
          title="閉じる"
          className="flex h-6 w-6 items-center justify-center rounded-full text-subtle-foreground transition hover:bg-foreground/10 hover:text-muted-foreground"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      {/* 作り方の選択（過去の旅行が無ければ出さない）。セグメントトラック型 */}
      {canCopy && (
        <div className="flex gap-1 rounded-md border border-foreground/10 p-1">
          <label
            className={`${seg} ${
              mode === "new"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-foreground/10"
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
            新規
          </label>
          <label
            className={`${seg} ${
              mode === "copy"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-foreground/10"
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
            コピー元<span className="ml-0.5 font-normal text-red-600">*</span>
          </span>
          <select
            value={sourceId}
            onChange={(e) => pickSource(e.target.value)}
            required={mode === "copy"}
            className="mt-1 block w-full rounded-md border border-foreground/20 bg-white px-3 py-2 focus:border-primary focus:outline-none"
          >
            <option value="" disabled>
              旅行を選択
            </option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {copyLabels.get(t.id) ?? t.title}
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
          タイトル<span className="ml-0.5 font-normal text-red-600">*</span>
        </span>
        <input
          name="title"
          required
          placeholder="ハワイ旅行"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full min-w-0 rounded-md border border-foreground/20 bg-white px-3 py-2 focus:border-primary focus:outline-none"
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
            onChange={(start, end) => setRange({ start, end })}
          />
        </div>
      </div>

      <div className="text-sm">
        <div className="flex items-center gap-1">
          <label htmlFor="default_currency" className="font-medium">
            精算通貨
          </label>
          <HelpTip label="精算通貨とは" widthClass="w-56">
            合計や割り勘の精算に使う通貨です（旅行先の通貨ではありません）
          </HelpTip>
        </div>
        <select
          id="default_currency"
          name="default_currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className="mt-1 block w-full rounded-md border border-foreground/20 bg-white px-3 py-2 focus:border-primary focus:outline-none"
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
        className="flex h-9 w-full items-center justify-center rounded-md bg-primary font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
      >
        <PlusIcon size={20} />
      </button>

      {showShorterWarning && (
        <p className="rounded-md bg-amber-50 p-3 text-xs leading-snug text-amber-800">
          ⚠ 日程がコピー元より短いため、一部の予定はコピーされません。
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
          <span className="ml-0.5 font-normal text-red-600">*</span>
        )}
      </span>
      <input
        {...rest}
        type={type}
        name={name}
        className="mt-1 block w-full min-w-0 rounded-md border border-foreground/20 bg-white px-3 py-2 focus:border-primary focus:outline-none"
      />
    </label>
  );
}
