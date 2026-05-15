"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  createExpenseAction,
  type CreateExpenseState,
} from "@/app/trips/[tripId]/actions";
import type { Currency } from "@/lib/types/database";

type Member = {
  id: string;
  display_name: string;
};

export type Category = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  sort_order: number;
};

const initialState: CreateExpenseState = { ok: false, error: null };

export function ExpenseForm({
  tripId,
  members,
  myMemberId,
  defaultCurrency, // trip のデフォルト通貨。為替レート計算の基準（換算なら 1）
  initialCurrency, // 通貨セレクタの初期値（= 最後に入力した費用の通貨）
  categories,
  initialCategoryId, // = 最後に入力した費用のカテゴリ
  averageRates, // { JPY: 1, USD: 平均 } — まだ履歴がない currency は省略
  initialPaidAt, // = 最後に入力した費用の日付
}: {
  tripId: string;
  members: Member[];
  myMemberId: string;
  defaultCurrency: Currency;
  initialCurrency: Currency;
  categories: Category[];
  initialCategoryId: string;
  averageRates: Partial<Record<Currency, number>>;
  initialPaidAt: string;
}) {
  const boundAction = createExpenseAction.bind(null, tripId);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    initialState,
  );

  const [localCurrency, setLocalCurrency] = useState<Currency>(initialCurrency);
  const [categoryId, setCategoryId] = useState<string>(initialCategoryId);
  const [paidAt, setPaidAt] = useState<string>(initialPaidAt);
  const [visibility, setVisibility] = useState<"shared" | "private">("shared");
  const [splittable, setSplittable] = useState(true);
  const [selectedSplits, setSelectedSplits] = useState<Set<string>>(
    () => new Set(members.map((m) => m.id)),
  );

  // レート入力欄。currency 変更時はデフォルト（平均 or 1）に戻す。
  const rateFor = (c: Currency): string => {
    if (c === defaultCurrency) return "1";
    const avg = averageRates[c];
    return avg !== undefined ? String(avg) : "";
  };
  const [rateInput, setRateInput] = useState<string>(() =>
    rateFor(initialCurrency),
  );

  const formRef = useRef<HTMLFormElement>(null);
  const noteId = useId();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      // 通貨 / カテゴリ / 日付 / レート / 公開範囲 / 割り勘は controlled。
      // 連続入力で前回値を引き継ぐため保持する（form.reset() は uncontrolled だけリセット）。
      // 支払った人は uncontrolled なので毎回「自分」に戻る（仕様）。
    }
  }, [state.ok]);

  const onCurrencyChange = (c: Currency) => {
    setLocalCurrency(c);
    setRateInput(rateFor(c));
  };

  const toggleSplit = (id: string) => {
    setSelectedSplits((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sort_order - b.sort_order),
    [categories],
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-md border border-zinc-200 bg-white p-4"
    >
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="block text-sm">
          <span className="font-medium">価格</span>
          <input
            type="number"
            name="local_price"
            required
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">通貨</span>
          <select
            name="local_currency"
            value={localCurrency}
            onChange={(e) => onCurrencyChange(e.target.value as Currency)}
            className="mt-1 block rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
          >
            <option value="JPY">JPY</option>
            <option value="USD">USD</option>
          </select>
        </label>
      </div>

      {localCurrency !== defaultCurrency && (
        <label className="block text-sm">
          <span className="font-medium">
            為替レート（1 {localCurrency} = ? {defaultCurrency}）
          </span>
          <input
            type="number"
            name="rate_to_default"
            required
            min="0"
            step="0.0001"
            inputMode="decimal"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            placeholder={
              averageRates[localCurrency] !== undefined
                ? String(averageRates[localCurrency])
                : "例: 150"
            }
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
          />
          {averageRates[localCurrency] !== undefined && (
            <span className="mt-1 block text-xs text-zinc-500">
              この旅行の平均レート: {averageRates[localCurrency]}
            </span>
          )}
        </label>
      )}
      {localCurrency === defaultCurrency && (
        <input type="hidden" name="rate_to_default" value="1" />
      )}

      <label className="block text-sm">
        <span className="font-medium">カテゴリ</span>
        <select
          name="category_id"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        >
          {sortedCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm" htmlFor={noteId}>
        <span className="font-medium">メモ（任意）</span>
        <input
          id={noteId}
          type="text"
          name="note"
          placeholder="ランチ、空港バス、など"
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">支払った人</span>
        <select
          name="payer_member_id"
          defaultValue={myMemberId}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium">日付</span>
        <input
          type="date"
          name="paid_at"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        />
      </label>

      <fieldset className="text-sm">
        <legend className="font-medium">公開範囲</legend>
        <div className="mt-1 flex gap-4">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="visibility"
              value="shared"
              checked={visibility === "shared"}
              onChange={() => setVisibility("shared")}
            />
            <span>共有（メンバーに見える）</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="visibility"
              value="private"
              checked={visibility === "private"}
              onChange={() => {
                setVisibility("private");
                setSplittable(false);
              }}
            />
            <span>プライベート（自分のみ）</span>
          </label>
        </div>
      </fieldset>

      {visibility === "shared" && (
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="splittable"
            checked={splittable}
            onChange={(e) => setSplittable(e.target.checked)}
          />
          <span>割り勘する</span>
        </label>
      )}

      {visibility === "shared" && splittable && (
        <fieldset className="text-sm">
          <legend className="font-medium">割り勘対象</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {members.map((m) => {
              const checked = selectedSplits.has(m.id);
              return (
                <label
                  key={m.id}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${
                    checked
                      ? "border-black bg-black text-white"
                      : "border-zinc-300 bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="split_member_ids"
                    value={m.id}
                    checked={checked}
                    onChange={() => toggleSplit(m.id)}
                    className="sr-only"
                  />
                  <span>{m.display_name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-10 w-full rounded-md bg-black font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
      >
        {isPending ? "追加中..." : "費用を追加"}
      </button>

      {state.error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
