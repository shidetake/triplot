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

import type { Currency } from "@triplot/shared/types/database";
import { CloseButton } from "./close-button";
import { CurrencySelect } from "./currency-select";
import { DateRangePopover } from "./date-range-popover";
import { FieldLabel } from "./field-label";
import { useInSheet } from "./form-host";
import { SaveIcon } from "./icons";
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
      className={`relative space-y-3 p-4 ${inSheet ? "" : "rounded-md border border-foreground/10 bg-background"}`}
    >
      {/* ボトムシート時は × を出さず下スワイプで閉じる（Instagram と同じ）。 */}
      {!inSheet && (
        <CloseButton onClick={onDone} className="absolute right-2 top-2 z-10" />
      )}

      {/* タイトルはラベル無し＋placeholder＝フィールド名（iOS カレンダー方式）。 */}
      <Input
        name="title"
        required
        placeholder={t("createTrip.title")}
        aria-label={t("createTrip.title")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="block w-full min-w-0"
      />

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
        <CurrencySelect
          id="default_currency"
          name="default_currency"
          value={currency}
          onChange={(v) => setCurrency(v as Currency)}
          className="mt-1 w-full"
        />
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
        // 必須（タイトル）は * でなく「埋まるまで保存無効」で表現（iOS 方式）。
        disabled={isPending || !title.trim()}
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
