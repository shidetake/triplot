"use client";

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { APIProvider } from "@vis.gl/react-google-maps";

import {
  createExpenseAction,
  type CreateExpenseState,
  deleteExpenseAction,
  updateExpenseAction,
} from "@/app/trips/[tripId]/actions";
import type { LatLng } from "@/lib/placeMap";
import {
  resolveExpenseTz,
  type TripTzTimeline,
} from "@/lib/schedule";
import type { Currency, Visibility } from "@/lib/types/database";

import { TIMEZONE_OPTIONS } from "./event-form";
import type { ExpenseRow } from "./expense-list";
import { ExpenseCategoryIcon } from "./expense-category-icon";
import { TrashIcon, CloseIcon } from "./icons";
import { PlacePicker, type PlacePickerInitial } from "./place-picker";

function tzLabel(iana: string): string {
  return (
    TIMEZONE_OPTIONS.find((o) => o.value === iana)?.label ??
    iana.split("/").pop()?.replace(/_/g, " ") ??
    iana
  );
}

type Member = {
  id: string;
  display_name: string;
};

export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
};

const initialState: CreateExpenseState = { ok: false, error: null };

// 時刻トグルを開いた直後の "12:00" を表す定数（揃え）。
const DEFAULT_TIME_ON_EXPAND = "12:00";

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
  places,
  biasCenter, // Google 検索の地理バイアス（既存ピン重心 or 東京）
  tzTimeline, // 旅程から日付→TZ を引くタイムライン（費用の発生TZ推定）
  // 編集モード。指定があると update 経路になり、各フィールドはこの値で
  // プリフィル。未指定なら従来通り新規作成。
  editExpense,
  canChangeVisibility = true,
  onDone, // ポップオーバーで使うとき: 追加成功で閉じる
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
  places: { id: string; name: string }[];
  biasCenter: LatLng;
  tzTimeline: TripTzTimeline;
  editExpense?: ExpenseRow;
  canChangeVisibility?: boolean;
  onDone?: () => void;
}) {
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const isEdit = !!editExpense;

  // 初期値はモードで切替（編集なら expense そのもの、新規なら最後入力 or 既定）。
  const initCurrency: Currency = isEdit
    ? editExpense.local_currency
    : initialCurrency;
  const initCategoryId = isEdit ? editExpense.category_id : initialCategoryId;
  const initPaidAtDate = isEdit
    ? editExpense.paid_at.slice(0, 10)
    : initialPaidAt;
  // 時刻は「指定したい人だけ」展開して入れるトグル方式。未展開時は 00:00
  // で送信し、一覧でも時刻表示が出ない（formatDateTime の挙動）。
  // 編集時は保存済み時刻が 00:00 以外なら最初から展開、新規は折りたたみ。
  const initPaidAtTime = isEdit ? editExpense.paid_at.slice(11, 16) : "00:00";
  const initShowTime = isEdit ? initPaidAtTime !== "00:00" : false;
  const initVisibility: Visibility = isEdit
    ? editExpense.visibility
    : "shared";
  const initSplittable = isEdit ? editExpense.splittable : true;
  const initSplits = isEdit
    ? new Set(editExpense.split_member_ids)
    : new Set(members.map((m) => m.id));

  const boundAction = isEdit
    ? updateExpenseAction.bind(null, tripId, editExpense.id)
    : createExpenseAction.bind(null, tripId);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    initialState,
  );

  // 削除は編集時のみ。private は作成者だけ（RPC と同条件）、shared は誰でも。
  const canDelete =
    !!editExpense &&
    (editExpense.visibility === "private"
      ? editExpense.created_by_member_id === myMemberId
      : true);
  const [isDeleting, startDelete] = useTransition();
  const onDelete = () => {
    if (!editExpense) return;
    if (!confirm("この費用を削除しますか？")) return;
    startDelete(async () => {
      const { error } = await deleteExpenseAction(tripId, editExpense.id);
      if (error) {
        alert(`削除に失敗しました: ${error}`);
        return;
      }
      onDone?.();
    });
  };

  const [localCurrency, setLocalCurrency] = useState<Currency>(initCurrency);
  const [categoryId, setCategoryId] = useState<string>(initCategoryId);
  const [paidAtDate, setPaidAtDate] = useState<string>(initPaidAtDate);
  const [paidAtTime, setPaidAtTime] = useState<string>(initPaidAtTime);
  const [showTime, setShowTime] = useState<boolean>(initShowTime);

  // 費用の発生TZ。編集時は保存値、新規は日付から旅程推測（乗継日は出発側を
  // 既定にして、下の2択でユーザが変えられる）。日付変更時に追従させる。
  const initTz = isEdit
    ? editExpense.tz
    : (() => {
        const r = resolveExpenseTz(initPaidAtDate, tzTimeline);
        return r.kind === "single" ? r.tz : r.departTz;
      })();
  const [tz, setTz] = useState<string>(initTz);
  // 今選ばれている日付に対する解決結果（single か 乗継日 ambiguous か）。
  const tzRes = useMemo(
    () => resolveExpenseTz(paidAtDate, tzTimeline),
    [paidAtDate, tzTimeline],
  );
  const multiTz = tzTimeline.transits.length > 0;

  const onDateChange = (newDate: string) => {
    setPaidAtDate(newDate);
    // 日付が変わったら TZ も推測し直す（乗継日は出発側を既定）。
    const r = resolveExpenseTz(newDate, tzTimeline);
    setTz(r.kind === "single" ? r.tz : r.departTz);
  };

  // 「＋ 時刻を指定」を押した直後に時刻 input にフォーカス＆ピッカーを開く
  // ためのフラグ。callback ref で input が mount した瞬間に拾う。
  const justExpandedRef = useRef(false);
  const timeInputCallback = (node: HTMLInputElement | null) => {
    if (!node || !justExpandedRef.current) return;
    justExpandedRef.current = false;
    node.focus();
    try {
      // showPicker は一部環境で user activation 切れ等で例外を投げる。
      // 失敗しても focus は当たっているので体感的にすぐ入力できる。
      node.showPicker();
    } catch {
      /* noop */
    }
  };

  const expandTime = () => {
    // 初期値は 12:00 固定（雑に入れる人向けのプリセット）。
    setPaidAtTime(DEFAULT_TIME_ON_EXPAND);
    justExpandedRef.current = true;
    setShowTime(true);
  };
  const collapseTime = () => {
    // 折りたたむ = 「時刻は気にしない」。00:00 戻しでフォーム経由で送る値も
    // 00:00 にする（一覧で時刻非表示）。
    setPaidAtTime("00:00");
    setShowTime(false);
  };
  const [visibility, setVisibility] = useState<Visibility>(initVisibility);
  const [splittable, setSplittable] = useState(initSplittable);
  const [selectedSplits, setSelectedSplits] = useState<Set<string>>(initSplits);

  // レート入力欄。currency 変更時はデフォルト（平均 or 1）に戻す。
  const rateFor = (c: Currency): string => {
    if (c === defaultCurrency) return "1";
    const avg = averageRates[c];
    return avg !== undefined ? String(avg) : "";
  };
  const [rateInput, setRateInput] = useState<string>(() =>
    isEdit ? String(editExpense.rate_to_default) : rateFor(initCurrency),
  );

  const formRef = useRef<HTMLFormElement>(null);
  const noteId = useId();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      // 通貨 / カテゴリ / 日付 / レート / 公開範囲 / 割り勘は controlled。
      // 連続入力で前回値を引き継ぐため保持する（form.reset() は uncontrolled だけリセット）。
      // 支払った人は uncontrolled なので毎回「自分」に戻る（仕様）。
      onDone?.(); // ポップオーバー時は予定追加と同様、成功で閉じる
    }
  }, [state.ok, onDone]);

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

  // 編集時、保存済みの場所をピッカーの初期値に。
  const placePickerInitial: PlacePickerInitial =
    isEdit && editExpense.place_id
      ? {
          kind: "saved",
          id: editExpense.place_id,
          name:
            places.find((p) => p.id === editExpense.place_id)?.name ?? "",
        }
      : null;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-md border border-zinc-200 bg-white p-4"
    >
      {onDone && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {isEdit ? "費用を編集" : "費用を追加"}
          </h3>
          <button
            type="button"
            onClick={onDone}
            aria-label="閉じる"
            className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

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
            defaultValue={isEdit ? editExpense.local_price : undefined}
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

      <div className="block text-sm">
        <span className="font-medium">カテゴリ</span>
        {/* <option> に SVG は描けないので、場所の IconPicker と同型の
            色チップ・グリッドで選ぶ。category_id は hidden input で送る。 */}
        <input type="hidden" name="category_id" value={categoryId} />
        <div className="mt-1 flex flex-wrap gap-1.5">
          {sortedCategories.map((c) => {
            const selected = c.id === categoryId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                title={c.name}
                aria-label={c.name}
                aria-pressed={selected}
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-white transition ${
                  selected
                    ? "border-zinc-900"
                    : "border-transparent opacity-50 hover:opacity-100"
                }`}
                style={{ backgroundColor: c.color }}
              >
                <ExpenseCategoryIcon icon={c.icon} size={18} />
              </button>
            );
          })}
        </div>
        <span className="mt-1 block text-xs text-zinc-500">
          {sortedCategories.find((c) => c.id === categoryId)?.name}
        </span>
      </div>

      <div className="block text-sm">
        <span className="font-medium">場所（任意）</span>
        {mapsApiKey ? (
          <APIProvider apiKey={mapsApiKey}>
            <PlacePicker
              places={places}
              biasCenter={biasCenter}
              initial={placePickerInitial}
            />
          </APIProvider>
        ) : (
          <PlacePicker
            places={places}
            biasCenter={biasCenter}
            initial={placePickerInitial}
          />
        )}
      </div>

      <label className="block text-sm" htmlFor={noteId}>
        <span className="font-medium">メモ（任意）</span>
        <input
          id={noteId}
          type="text"
          name="note"
          placeholder="ランチ、空港バス、など"
          defaultValue={isEdit ? (editExpense.note ?? "") : ""}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">支払った人</span>
        <select
          name="payer_member_id"
          defaultValue={isEdit ? editExpense.payer_member_id : myMemberId}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
      </label>

      {/* 日付（必須）＋時刻（任意・展開すると入れられる） */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0 text-sm">
          <span className="font-medium">日付</span>
          <input
            type="date"
            name="paid_at_date"
            required
            value={paidAtDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="mt-1 block w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
          />
        </label>
        {showTime ? (
          <div className="block min-w-0 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">時刻</span>
              <button
                type="button"
                onClick={collapseTime}
                aria-label="時刻をやめる"
                className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
              >
                <CloseIcon size={12} />
              </button>
            </div>
            <input
              ref={timeInputCallback}
              type="time"
              name="paid_at_time"
              required
              value={paidAtTime}
              onChange={(e) => setPaidAtTime(e.target.value)}
              className="mt-1 block w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col text-sm">
            {/* 日付ラベルと縦位置を揃えるためのダミー */}
            <span aria-hidden className="invisible font-medium">
              時刻
            </span>
            <button
              type="button"
              onClick={expandTime}
              className="mt-1 h-[42px] rounded-md border border-dashed border-zinc-300 px-3 text-xs text-zinc-500 transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900"
            >
              ＋ 時刻を指定
            </button>
            <input type="hidden" name="paid_at_time" value="00:00" />
          </div>
        )}
      </div>

      {/* タイムゾーン。サーバへは常に hidden で送る（内部は保持）。
          時刻を指定したときだけ意味を持つので、表示も showTime のときだけ。
          複数TZ旅程の通常日は控えめ表示、乗継日は出発/到着の2択。 */}
      <input type="hidden" name="tz" value={tz} />
      {showTime &&
        multiTz &&
        (tzRes.kind === "ambiguous" ? (
          <fieldset className="text-sm">
            <p className="text-[11px] text-zinc-500">
              移動日です。どちらのタイムゾーンで使ったか選んでください。
            </p>
            <div className="mt-1 flex flex-col gap-1">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="tz_choice"
                  checked={tz === tzRes.departTz}
                  onChange={() => setTz(tzRes.departTz)}
                />
                <span>出発側: {tzLabel(tzRes.departTz)}</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="tz_choice"
                  checked={tz === tzRes.arriveTz}
                  onChange={() => setTz(tzRes.arriveTz)}
                />
                <span>到着側: {tzLabel(tzRes.arriveTz)}</span>
              </label>
            </div>
          </fieldset>
        ) : (
          <p className="text-xs text-zinc-500">
            現地タイムゾーン: {tzLabel(tz)}
          </p>
        ))}

      {canChangeVisibility ? (
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
              <span>共有</span>
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
              <span>自分のみ</span>
            </label>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="visibility" value={visibility} />
      )}

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

      <div className="flex gap-2">
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            aria-label="削除"
            title="削除"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            <TrashIcon size={18} />
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="h-10 flex-1 rounded-md bg-black font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending
            ? isEdit
              ? "保存中..."
              : "追加中..."
            : isEdit
              ? "保存"
              : "費用を追加"}
        </button>
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
