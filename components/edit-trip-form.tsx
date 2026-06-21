"use client";

import { useActionState, useEffect, useState } from "react";

import {
  updateTripAction,
  type UpdateTripState,
} from "@/app/trips/[tripId]/actions";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { CloseButton } from "./close-button";
import { DateRangePopover } from "./date-range-popover";
import { FieldLabel } from "./field-label";
import { useInSheet } from "./form-host";
import { SaveIcon } from "./icons";
import { inputClass } from "./input-class";
import { MessageBox } from "./message-box";

type Currency = "JPY" | "USD";

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "JPY", label: "JPY 日本円" },
  { value: "USD", label: "USD 米ドル" },
];

const initialState: UpdateTripState = { ok: false, error: null };

// 旅行のタイトル・日程・精算通貨を編集する（admin のみ。⋯メニューから開く）。
export function EditTripForm({
  tripId,
  title: initialTitle,
  startDate,
  endDate,
  defaultCurrency,
  hasExpenses,
  onDone,
}: {
  tripId: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  defaultCurrency: Currency;
  hasExpenses: boolean;
  onDone?: () => void;
}) {
  const inSheet = useInSheet();
  const [state, formAction, isPending] = useActionState(
    updateTripAction.bind(null, tripId),
    initialState,
  );
  const [title, setTitle] = useState(initialTitle);
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);

  useEffect(() => {
    if (state.ok) {
      toast("保存しました");
      onDone?.();
    }
  }, [state.ok, onDone]);

  return (
    <form
      action={formAction}
      className="relative space-y-3 rounded-md border border-foreground/10 bg-white p-4"
    >
      {/* ボトムシート時は × を出さず下スワイプで閉じる（Instagram と同じ）。 */}
      {!inSheet && (
        <CloseButton onClick={onDone} className="absolute right-2 top-2 z-10" />
      )}

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

      <div className="text-sm">
        <FieldLabel required>日程</FieldLabel>
        <div className="mt-1">
          <DateRangePopover
            startName="start_date"
            endName="end_date"
            required
            defaultStart={startDate}
            defaultEnd={endDate}
          />
        </div>
      </div>

      <div className="text-sm">
        <label htmlFor="default_currency" className="font-medium">
          精算通貨
        </label>
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
        {/* 精算通貨を変えても既存費用の換算レート(rate_to_default)は再計算されない＝金額の解釈が
            ずれる。費用がある旅行で通貨を変える時だけ注意を出す。 */}
        {hasExpenses && currency !== defaultCurrency && (
          <MessageBox kind="warning" className="mt-1 text-xs leading-snug">
            ⚠ 既存の費用の換算レートは再計算されません。費用がある旅行で精算通貨を変えると金額の解釈がずれます。
          </MessageBox>
        )}
      </div>

      <Button
        type="submit"
        disabled={isPending}
        aria-label="保存"
        title="保存"
        className="w-full"
      >
        <SaveIcon size={20} />
      </Button>

      {state.error && <MessageBox kind="error">{state.error}</MessageBox>}
    </form>
  );
}
