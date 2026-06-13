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
import { toast } from "@/components/toast";
import { confirmDialog } from "@/components/confirm-dialog";

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

import { DatePopover } from "./date-popover";
import { TIMEZONE_OPTIONS } from "./event-form";
import type { ExpenseRow } from "./expense-list";
import { CategorySelect } from "./category-select";
import { TrashIcon, CloseIcon, PlusIcon, SaveIcon } from "./icons";
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
  tripStart, // DatePopover の旅行期間ハイライト用
  tripEnd,
  // 編集モード。指定があると update 経路になり、各フィールドはこの値で
  // プリフィル。未指定なら従来通り新規作成。
  editExpense,
  canChangeVisibility = true,
  onDone, // ポップオーバーで使うとき: 追加成功で閉じる
  onSuccess, // 追加/更新が成功したときだけ呼ぶ（× 閉じでは呼ばれない）
  // 新規モードの事前入力（レシート取り込みの確定で使う）。通貨/カテゴリ/日付は
  // 既存の initial* で渡すので、ここは価格・メモ・場所だけ。
  initialPrice,
  initialNote,
  initialPlace,
  initialTime, // "HH:MM"。あれば時刻欄を開いて事前入力する。
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
  tripStart: string | null;
  tripEnd: string | null;
  editExpense?: ExpenseRow;
  canChangeVisibility?: boolean;
  onDone?: () => void;
  onSuccess?: () => void;
  initialPrice?: number;
  initialNote?: string;
  initialPlace?: PlacePickerInitial;
  initialTime?: string;
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
  const initPaidAtTime = isEdit
    ? editExpense.paid_at.slice(11, 16)
    : (initialTime ?? "00:00");
  const initShowTime = isEdit
    ? initPaidAtTime !== "00:00"
    : !!initialTime && initialTime !== "00:00";
  const initVisibility: Visibility = isEdit
    ? editExpense.visibility
    : "shared";
  // 編集モードで splittable=false の費用は「自分のみ（=おごり / 自分の費用）」
  // として復元する。split_member_ids は空で保存されているので、ここで自分を
  // 1人だけ選択した状態にしておく（チップ UI で自分のみ表示）。
  const initOnlySelf = isEdit && !editExpense.splittable;
  const initSplits: Set<string> = initOnlySelf
    ? new Set([myMemberId])
    : isEdit
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
  const onDelete = async () => {
    if (!editExpense) return;
    if (!(await confirmDialog({ title: "この費用を削除しますか？" }))) return;
    startDelete(async () => {
      const { error } = await deleteExpenseAction(tripId, editExpense.id);
      if (error) {
        toast(`削除に失敗しました: ${error}`);
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
  const [selectedSplits, setSelectedSplits] = useState<Set<string>>(initSplits);

  // 割り勘対象の "全員 / 一部" モード（event-form の参加者と同じ disclosure）。
  // 編集時、保存済み split がアクティブメンバーと完全一致なら "all"。
  // それ以外（subset / 自分のみ）は "custom" でチップ展開した状態で開く。
  const splitsMatchAll = (() => {
    if (initSplits.size !== members.length) return false;
    return members.every((m) => initSplits.has(m.id));
  })();
  const [splitMode, setSplitMode] = useState<"all" | "custom">(
    isEdit && !splitsMatchAll ? "custom" : "all",
  );

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
      onSuccess?.(); // 成功時のみ（取り込み下書きを確定済みにする等）
      onDone?.(); // ポップオーバー時は予定追加と同様、成功で閉じる
    }
  }, [state.ok, onSuccess, onDone]);

  const onCurrencyChange = (c: Currency) => {
    setLocalCurrency(c);
    setRateInput(rateFor(c));
  };

  const toggleSplit = (id: string) => {
    setSelectedSplits((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // 最後の1人は外せない（0人で割り勘は無意味なので）
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 割り勘対象から splittable と split_member_ids を導出する。
  //  - 自分のみ選択（=「割り勘しない」と同義）→ splittable=false, ids=[]
  //  - 全員 / 一部（自分以外も居る） → splittable=true, ids=選択分
  //  - private → 強制的に splittable=false（DB の CHECK 制約に合わせる）
  const onlySelf =
    selectedSplits.size === 1 && selectedSplits.has(myMemberId);
  const submittedSplittable = visibility === "shared" && !onlySelf;
  const submittedSplitIds: string[] = !submittedSplittable
    ? []
    : splitMode === "all"
      ? members.map((m) => m.id)
      : Array.from(selectedSplits);

  // disclosure ラベルは選択状態から決める。
  //  - 全員選択 → "全員"
  //  - 自分のみ → "自分のみ"
  //  - その他   → "一部"
  const allSelectedNow =
    selectedSplits.size === members.length &&
    members.every((m) => selectedSplits.has(m.id));
  const splitLabel = onlySelf
    ? "自分のみ"
    : allSelectedNow
      ? "全員"
      : "一部";

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
      : (initialPlace ?? null);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-md border border-foreground/10 bg-white p-4"
    >
      {onDone && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDone}
            aria-label="閉じる"
            title="閉じる"
            className="flex h-6 w-6 items-center justify-center rounded-full text-subtle-foreground transition hover:bg-foreground/10 hover:text-muted-foreground"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="block text-sm">
          <span className="font-medium">
            価格<span className="ml-0.5 font-normal text-red-500">*</span>
          </span>
          <input
            type="number"
            name="local_price"
            required
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0"
            defaultValue={isEdit ? editExpense.local_price : initialPrice}
            className="mt-1 block w-full rounded-md border border-foreground/20 bg-white px-3 py-2 focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">通貨</span>
          <select
            name="local_currency"
            value={localCurrency}
            onChange={(e) => onCurrencyChange(e.target.value as Currency)}
            className="mt-1 block rounded-md border border-foreground/20 bg-white px-3 py-2 focus:border-primary focus:outline-none"
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
            <span className="ml-0.5 font-normal text-red-500">*</span>
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
            className="mt-1 block w-full rounded-md border border-foreground/20 bg-white px-3 py-2 focus:border-primary focus:outline-none"
          />
          {averageRates[localCurrency] !== undefined && (
            <span className="mt-1 block text-xs text-muted-foreground">
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
        <CategorySelect
          name="category_id"
          categories={sortedCategories}
          value={categoryId}
          onChange={setCategoryId}
        />
      </div>

      <div className="block text-sm">
        <span className="font-medium">場所</span>
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
        <span className="font-medium">メモ</span>
        <input
          id={noteId}
          type="text"
          name="note"
          placeholder="ランチ"
          defaultValue={isEdit ? (editExpense.note ?? "") : (initialNote ?? "")}
          className="mt-1 block w-full rounded-md border border-foreground/20 bg-white px-3 py-2 focus:border-primary focus:outline-none"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">支払った人</span>
        <select
          name="payer_member_id"
          defaultValue={isEdit ? editExpense.payer_member_id : myMemberId}
          className="mt-1 block w-full rounded-md border border-foreground/20 bg-white px-3 py-2 focus:border-primary focus:outline-none"
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
          <span className="font-medium">
            日付<span className="ml-0.5 font-normal text-red-500">*</span>
          </span>
          <div className="mt-1">
            <DatePopover
              name="paid_at_date"
              value={paidAtDate}
              onChange={onDateChange}
              required
              tripStart={tripStart}
              tripEnd={tripEnd}
            />
          </div>
        </label>
        {showTime ? (
          <div className="block min-w-0 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">時刻</span>
              <button
                type="button"
                onClick={collapseTime}
                aria-label="時刻をやめる"
                title="時刻をやめる"
                className="flex h-5 w-5 items-center justify-center rounded-full text-subtle-foreground transition hover:bg-foreground/10 hover:text-muted-foreground"
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
              className="mt-1 block w-full min-w-0 rounded-md border border-foreground/20 bg-white px-3 py-2 focus:border-primary focus:outline-none"
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
              className="mt-1 h-[42px] rounded-md border border-dashed border-foreground/20 px-3 text-xs text-muted-foreground transition hover:border-foreground/40 hover:bg-foreground/10 hover:text-foreground"
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
            <p className="text-[11px] text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">
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
                onChange={() => setVisibility("private")}
              />
              <span>自分のみ</span>
            </label>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="visibility" value={visibility} />
      )}

      {/* 割り勘対象。event-form の参加者と同じ disclosure + chip パターン。
          デフォルトは「割り勘対象: 全員 ▼」。タップで展開してチップで選択。
          展開状態は選択内容で「全員 ▲」「一部 ▲」「自分のみ ▲」に切り替わる。
          自分のみ = 割り勘しない（=おごり/自分の費用）と同義。 */}
      {visibility === "shared" && members.length > 1 && (
        <div className="text-sm">
          <button
            type="button"
            onClick={() => {
              if (splitMode === "all") {
                setSplitMode("custom");
              } else {
                setSplitMode("all");
                setSelectedSplits(new Set(members.map((m) => m.id)));
              }
            }}
            aria-expanded={splitMode === "custom"}
            className="inline-flex items-center gap-1 rounded font-medium text-muted-foreground transition hover:text-foreground"
          >
            <span>割り勘対象: {splitMode === "all" ? "全員" : splitLabel}</span>
            <span className="text-[10px] text-muted-foreground">
              {splitMode === "all" ? "▼" : "▲"}
            </span>
          </button>
          {splitMode === "custom" && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {members.map((m) => {
                const on = selectedSplits.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleSplit(m.id)}
                    aria-pressed={on}
                    className={
                      on
                        ? "rounded-full bg-primary px-2.5 py-0.5 text-xs text-primary-foreground"
                        : "rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-subtle-foreground ring-1 ring-foreground/10"
                    }
                  >
                    {m.display_name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 送信用 hidden inputs。"自分のみ" は splittable=false + 空配列、
          それ以外（全員/一部）は splittable=true + 選択分。 */}
      {submittedSplittable && (
        <input type="hidden" name="splittable" value="on" />
      )}
      {submittedSplitIds.map((id) => (
        <input key={id} type="hidden" name="split_member_ids" value={id} />
      ))}

      <div className="flex gap-2">
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            aria-label="削除"
            title="削除"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-600/20 text-red-600 transition hover:bg-red-600/10 disabled:opacity-50"
          >
            <TrashIcon size={18} />
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          aria-label={isEdit ? "保存" : "追加"}
          title={isEdit ? "保存" : "追加"}
          className="flex h-9 flex-1 items-center justify-center rounded-md bg-primary font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          {isEdit ? <SaveIcon size={20} /> : <PlusIcon size={20} />}
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
