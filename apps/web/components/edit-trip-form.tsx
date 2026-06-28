"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  updateTripAction,
  type UpdateTripState,
} from "@/app/trips/[tripId]/actions";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { COMMON_CURRENCIES, ALL_CURRENCIES, currencyLabel } from "@triplot/shared/currencies";
import type { Currency } from "@triplot/shared/types/database";
import { CloseButton } from "./close-button";
import { DateRangePopover } from "./date-range-popover";
import { FieldLabel } from "./field-label";
import { useInSheet } from "./form-host";
import { SaveIcon } from "./icons";
import { inputClass } from "./input-class";
import { MessageBox } from "./message-box";

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
  const t = useTranslations();
  const [state, formAction, isPending] = useActionState(
    updateTripAction.bind(null, tripId),
    initialState,
  );
  const [title, setTitle] = useState(initialTitle);
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);

  useEffect(() => {
    if (state.ok) {
      toast(t("common.saved"));
      onDone?.();
    }
  }, [state.ok, onDone, t]);

  return (
    <form
      action={formAction}
      className="relative space-y-3 rounded-md border border-foreground/10 bg-background p-4"
    >
      {/* ボトムシート時は × を出さず下スワイプで閉じる（Instagram と同じ）。 */}
      {!inSheet && (
        <CloseButton onClick={onDone} className="absolute right-2 top-2 z-10" />
      )}

      <label className="block min-w-0 text-sm">
        <FieldLabel required>{t("createTrip.title")}</FieldLabel>
        <Input
          name="title"
          required
          placeholder={t("createTrip.titlePlaceholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full min-w-0"
        />
      </label>

      <div className="text-sm">
        <FieldLabel required>{t("createTrip.dates")}</FieldLabel>
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
          {t("createTrip.settlementCurrency")}
        </label>
        <select
          id="default_currency"
          name="default_currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className={`mt-1 block w-full ${inputClass}`}
        >
          <optgroup label="主要通貨">
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>{currencyLabel(c)}</option>
            ))}
          </optgroup>
          <optgroup label="その他">
            {ALL_CURRENCIES.filter((c) => !COMMON_CURRENCIES.includes(c)).map((c) => (
              <option key={c} value={c}>{currencyLabel(c)}</option>
            ))}
          </optgroup>
        </select>
        {/* 精算通貨を変えても既存費用の換算レート(rate_to_default)は再計算されない＝金額の解釈が
            ずれる。費用がある旅行で通貨を変える時だけ注意を出す。 */}
        {hasExpenses && currency !== defaultCurrency && (
          <MessageBox kind="warning" className="mt-1 text-xs leading-snug">
            {t("tripDetail.rateChangeWarning")}
          </MessageBox>
        )}
      </div>

      <Button
        type="submit"
        disabled={isPending}
        aria-label={t("common.save")}
        title={t("common.save")}
        className="w-full"
      >
        <SaveIcon size={20} />
      </Button>

      {state.error && <MessageBox kind="error">{state.error}</MessageBox>}
    </form>
  );
}
