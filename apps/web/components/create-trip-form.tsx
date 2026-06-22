"use client";

import { useActionState, useState } from "react";

import {
  createTripAction,
  type CreateTripState,
} from "@/app/trips/create-trip-action";

import { buildCopySourceLabels } from "@/lib/copySourceLabel";
import { tripDayCount } from "@/lib/tripCopy";

import { DateRangePopover } from "./date-range-popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inputClass } from "./input-class";
import { FieldLabel } from "./field-label";
import { HelpTip } from "./help-tip";
import { MessageBox } from "./message-box";
import { PlusIcon } from "./icons";
import { CloseButton } from "./close-button";
import { useClearDraft, useDraft, useInSheet } from "./form-host";

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

  // ボトムシート時は入力途中で閉じても残るよう、データ系 state は useDraft で保持する。
  const inSheet = useInSheet();
  const clearDraft = useClearDraft();

  const canCopy = trips.length > 0;
  const [mode, setMode] = useDraft<"new" | "copy">("mode", "new");
  const [sourceId, setSourceId] = useDraft("sourceId", "");
  // タイトル・通貨はコピー元選択時にプリフィルしたいので制御する。
  const [title, setTitle] = useDraft("title", "");
  const [displayName, setDisplayName] = useDraft(
    "displayName",
    defaultDisplayName ?? "",
  );
  const [currency, setCurrency] = useDraft<Currency>("currency", "JPY");
  // 選択中の日程（コピー元より短いかの判定に使う）。日程の真の値は DateRangePopover が
  // 内部に持ち（remount でリセットされる）、これはその警告判定用ミラーなので保持しない
  // （保持すると picker 表示が空なのに警告だけ出る不整合になる）。
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

  // セグメントトラックの各セグメント（ui-guidelines「定型部品」）。
  // sr-only の radio に focus が当たるので、ラベル側で has-[:focus-visible] のリングを出す（a11y）。
  const seg =
    "flex flex-1 cursor-pointer items-center justify-center rounded px-2 py-1.5 text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

  return (
    <form
      action={formAction}
      // 成功時は createTripAction が redirect するので state.ok の通知が無い。送信時に下書きを
      // 破棄しておけば、成功（=このまま遷移してアンマウント）後に残らない。HTML バリデーションで
      // 弾かれた時は onSubmit 自体が発火しないので消えない。
      onSubmit={() => clearDraft()}
      className="relative space-y-3 rounded-md border border-foreground/10 bg-white p-4"
    >
      {/* × は専用行を作らず右上角に重ねる（ui-guidelines「× 閉じるは右上角」）。
          先頭が全幅のセグメントトラックのとき（canCopy）は mr で × の下に潜らせない。
          ボトムシート時は × を出さず下スワイプで閉じる（Instagram と同じ）。 */}
      {!inSheet && (
        <CloseButton onClick={onDone} className="absolute right-2 top-2 z-10" />
      )}

      {/* 作り方の選択（過去の旅行が無ければ出さない）。セグメントトラック型。
          右クリアランス mr-7 は × がある時（PC ポップオーバー）だけ＝シートは × が無いので端まで。 */}
      {canCopy && (
        <div
          className={`${inSheet ? "" : "mr-7"} flex gap-1 rounded-md border border-foreground/10 p-1`}
        >
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
          <FieldLabel required>コピー元</FieldLabel>
          <select
            value={sourceId}
            onChange={(e) => pickSource(e.target.value)}
            required={mode === "copy"}
            className={`mt-1 block w-full ${inputClass}`}
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
        <FieldLabel required>タイトル</FieldLabel>
        <Input
          name="title"
          required
          placeholder="ハワイ旅行"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full min-w-0"
        />
      </label>

      <Field
        label="あなたの表示名（旅行内）"
        name="display_name"
        required
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      <div className="text-sm">
        <FieldLabel required>日程</FieldLabel>
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
          className={`mt-1 block w-full ${inputClass}`}
        >
          {CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        aria-label="作成"
        title="作成"
        className="w-full"
      >
        <PlusIcon size={20} />
      </Button>

      {showShorterWarning && (
        <MessageBox kind="warning" className="text-xs leading-snug">
          ⚠ 日程がコピー元より短いため、一部の予定はコピーされません。
        </MessageBox>
      )}

      {state.error && (
        <MessageBox kind="error">{state.error}</MessageBox>
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
      <FieldLabel required={rest.required}>{label}</FieldLabel>
      <Input
        {...rest}
        type={type}
        name={name}
        className="mt-1 block w-full min-w-0"
      />
    </label>
  );
}
