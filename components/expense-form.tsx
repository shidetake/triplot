"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  createExpenseAction,
  type CreateExpenseState,
} from "@/app/trips/[tripId]/actions";
import type { Currency } from "@/lib/types/database";

type Member = {
  id: string;
  display_name: string;
};

const initialState: CreateExpenseState = { ok: false, error: null };

export function ExpenseForm({
  tripId,
  members,
  myMemberId,
  defaultCurrency,
  availableCurrencies,
  defaultPaidAt,
}: {
  tripId: string;
  members: Member[];
  myMemberId: string;
  defaultCurrency: Currency;
  availableCurrencies: Currency[];
  defaultPaidAt: string; // YYYY-MM-DD
}) {
  const boundAction = createExpenseAction.bind(null, tripId);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    initialState,
  );

  const [visibility, setVisibility] = useState<"shared" | "private">("shared");
  const [splittable, setSplittable] = useState(true);
  const [selectedSplits, setSelectedSplits] = useState<Set<string>>(
    () => new Set(members.map((m) => m.id)),
  );

  const formRef = useRef<HTMLFormElement>(null);
  const noteId = useId();

  // 成功時に uncontrolled な入力（金額・メモ等）だけリセット。
  // visibility / splittable / 対象は次の費用入力でも流用しやすいよう保持する。
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  const toggleSplit = (id: string) => {
    setSelectedSplits((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-md border border-zinc-200 bg-white p-4"
    >
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="block text-sm">
          <span className="font-medium">金額</span>
          <input
            type="number"
            name="amount"
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
            name="currency"
            defaultValue={defaultCurrency}
            className="mt-1 block rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
          >
            {availableCurrencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

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
          defaultValue={defaultPaidAt}
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
