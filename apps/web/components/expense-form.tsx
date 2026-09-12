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
import { useLocale, useTranslations } from "next-intl";
import { useUndoable } from "@/lib/undoable";
import { err, ok } from "@triplot/shared/data/result";

import { APIProvider } from "@vis.gl/react-google-maps";

import {
  createExpenseAction,
  type CreateExpenseState,
  deleteExpenseAction,
  restoreExpenseAction,
  updateExpenseAction,
} from "@/app/trips/[tripId]/actions";
import { formatRate } from "@triplot/shared/formatRate";
import { initialRate } from "@triplot/shared/import/draftRate";
import type { FxRates } from "@triplot/shared/fxRates";
import type { LatLng } from "@triplot/shared/placeMap";
import {
  dedupeTzCandidates,
  resolveExpenseTz,
  timelineFor,
  type TripTzTimeline,
  type TzCandidate,
} from "@triplot/shared/schedule";
import type { Currency, Visibility } from "@triplot/shared/types/database";

import { DatePopover } from "./date-popover";
import { useTzLabel } from "./timezone-picker";
import type { ExpenseRow } from "./expense-list";
import { CategorySelect } from "./category-select";
import { CurrencySelect } from "./currency-select";
import { FieldLabel } from "./field-label";
import { MessageBox } from "./message-box";
import { TrashIcon, PlusIcon, SaveIcon, ChevronIcon } from "./icons";
import { PlacePicker, type PlacePickerInitial } from "./place-picker";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { CloseButton } from "./close-button";
import { ToggleChip } from "./toggle-chip";
import { useClearDraft, useDraft, useInSheet } from "./form-host";

type Member = {
  id: string;
  display_name: string;
  color: number | null; // メンバー色 hue（チップの色付けに使う）
};

// 型の単一の真実は shared 側（RN と共用）。既存 import を壊さないよう re-export。
import type { Category } from "@triplot/shared/tripDerive";
export type { Category };

const initialState: CreateExpenseState = { ok: false, error: null };

// 時刻トグルを開いた直後の "12:00" を表す定数（揃え）。
const DEFAULT_TIME_ON_EXPAND = "12:00";

export function ExpenseForm({
  tripId,
  members,
  myMemberId,
  defaultCurrency, // trip のデフォルト通貨。為替レート計算の基準（換算なら 1）
  initialCurrency, // 通貨セレクタの初期値（= 最後に入力した費用の通貨）
  fxRates,
  categories,
  initialCategoryId, // = 最後に入力した費用のカテゴリ
  averageRates, // { JPY: 1, USD: 平均 } — まだ履歴がない currency は省略
  initialPaidAt, // = 最後に入力した費用の日付
  places,
  biasCenter, // Google 検索の地理バイアス（既存ピン重心 or 東京）
  tzTimeline, // 旅程から日付→TZ を引くタイムライン（費用の発生TZ推定）
  initialTzDisambig,
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
  autoResolvePlace,
  initialTime, // "HH:MM"。あれば時刻欄を開いて事前入力する。
}: {
  tripId: string;
  members: Member[];
  myMemberId: string;
  defaultCurrency: Currency;
  initialCurrency: Currency;
  // 取り込みから作る時、取り込み時点で取っておいた市場レート表（draftRate.ts）。
  fxRates?: FxRates | null;
  categories: Category[];
  initialCategoryId: string;
  averageRates: Partial<Record<Currency, number>>;
  initialPaidAt: string;
  places: { id: string; name: string }[];
  biasCenter: LatLng;
  tzTimeline: TripTzTimeline;
  // 取り込みの下書きから開いたときの、移動日のTZの初期選択。
  initialTzDisambig?: { transitId: string; side: "depart" | "arrive" } | null;
  tripStart: string | null;
  tripEnd: string | null;
  editExpense?: ExpenseRow;
  canChangeVisibility?: boolean;
  onDone?: () => void;
  // 追加成功時は作成した費用の id が渡る（更新成功時は undefined）。
  onSuccess?: (expenseId?: string) => void;
  initialPrice?: number;
  initialNote?: string;
  initialPlace?: PlacePickerInitial;
  // 取り込み用: 場所欄を開いた時に店名を Google 自動解決（高確信なら丸める）。
  autoResolvePlace?: { name: string; address?: string | null } | null;
  initialTime?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("expense");
  const tCommon = useTranslations("common");
  const tzLabel = useTzLabel();
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
  // 「全員」で保存された費用は具体的な ID を持たないので、開いた時点の
  // アクティブメンバーに解決する（後から加わった人もここに現れる）。
  const initSplits: Set<string> = initOnlySelf
    ? new Set([myMemberId])
    : isEdit && !editExpense.split_everyone
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
  // 再取得は各アクションの revalidatePath が行う。
  const runUndoable = useUndoable(() => {});
  // 確認は挟まず、済ませてから戻せるようにする（ui-guidelines「確認とアンドゥは
  // 同じ問題への2つの答え」）。控えには割り勘の対象と、この費用として確定した
  // 取り込みの下書きの紐づけも入っている。
  const onDelete = () => {
    if (!editExpense) return;
    const id = editExpense.id;
    startDelete(() => {
      runUndoable({
        apply: async () => {
          const { error, snapshot } = await deleteExpenseAction(tripId, id);
          return error || !snapshot ? err(error ?? "") : ok(snapshot);
        },
        restore: async (snapshot) => {
          const { error } = await restoreExpenseAction(tripId, snapshot);
          return error ? err(error) : ok(undefined);
        },
        done: t("deleted"),
        failed: (error) => t("deleteFailed", { error }),
      });
      clearDraft(); // 対象が消えたので下書きも破棄
      onDone?.();
    });
  };

  // ボトムシート時は入力途中で閉じても残るよう、データ系 state は useDraft で保持する
  // （ポップオーバー時は draftKey が無いので素の useState 相当）。clearDraft は送信/削除成功で破棄。
  const inSheet = useInSheet();
  const clearDraft = useClearDraft();

  // 価格・メモは元々 uncontrolled（defaultValue）だったが、シートのアンマウントを跨いで
  // 残すには controlled にする必要があるので useDraft の controlled 値にする。
  const [price, setPrice] = useDraft<string>("price", () =>
    isEdit
      ? String(editExpense.local_price)
      : initialPrice != null
        ? String(initialPrice)
        : "",
  );
  const [note, setNote] = useDraft<string>("note", () =>
    isEdit ? (editExpense.note ?? "") : (initialNote ?? ""),
  );

  const [localCurrency, setLocalCurrency] = useDraft<Currency>(
    "localCurrency",
    initCurrency,
  );
  const [categoryId, setCategoryId] = useDraft<string>(
    "categoryId",
    initCategoryId,
  );
  // 支払った人。普通は入力者＝支払者なので既定は自分＋折りたたみ表示（あまり触らない）。
  const [payer, setPayer] = useDraft<string>("payer", () =>
    isEdit ? editExpense.payer_member_id : myMemberId,
  );
  // 開閉トグルは純粋な表示状態なので保持しない（毎回畳んで開く）。
  const [payerOpen, setPayerOpen] = useState<boolean>(false);
  // 年表は人ごと（timelineFor 参照）。費用の TZ は支払った人の年表で引く。
  const payerTimeline = useMemo(
    () => timelineFor(tzTimeline, [payer]),
    [tzTimeline, payer],
  );
  const [paidAtDate, setPaidAtDate] = useDraft<string>(
    "paidAtDate",
    initPaidAtDate,
  );
  const [paidAtTime, setPaidAtTime] = useDraft<string>(
    "paidAtTime",
    initPaidAtTime,
  );
  const [showTime, setShowTime] = useDraft<boolean>("showTime", initShowTime);

  // 費用の発生TZ。編集時は保存値（page.tsx で解決済み）、新規は日付から旅程
  // 推測（乗継日は出発側を既定にして、下の選択肢でユーザが変えられる）。
  // tzDisambig* = 保存する選択（乗継日以外は両方 null のまま＝毎回自動導出）。
  const initResolution = resolveExpenseTz(initPaidAtDate, payerTimeline);
  const initTz = isEdit
    ? editExpense.tz
    : initResolution.kind === "single"
      ? initResolution.tz
      : (initialTzDisambig
          ? initResolution.options.find(
              (o) =>
                o.transitId === initialTzDisambig.transitId &&
                o.side === initialTzDisambig.side,
            )
          : null
        )?.tz ?? initResolution.options[0].tz;
  // 編集時、保存済みの選択が無い（=マイグレーション前の既存データ、または
  // 自動導出のまま保存された）乗継日は、tz と同じ先頭候補を選択肢にも反映する
  // （「実際は選ばれているのにどれもチェックが付いていない」を防ぐ）。
  // 下書きから開いたときは、下書きが決めた側を初期選択にする（経度→時刻の
  // 2段。deriveExpenseDraftItems 参照）。これが無いと移動日は常に先頭候補＝
  // 出発側になり、到着後の支払いが出発地のTZで開く。
  const editDisambig =
    initResolution.kind !== "ambiguous"
      ? null
      : isEdit
        ? editExpense.tzDisambigTransitId && editExpense.tzDisambigSide
          ? {
              transitId: editExpense.tzDisambigTransitId,
              side: editExpense.tzDisambigSide,
            }
          : initResolution.options[0]
        : (initialTzDisambig ?? initResolution.options[0]);
  const [tz, setTzRaw] = useDraft<string>("tz", initTz);
  const [tzDisambigTransitId, setTzDisambigTransitId] = useDraft<
    string | null
  >("tzDisambigTransitId", editDisambig?.transitId ?? null);
  const [tzDisambigSide, setTzDisambigSide] = useDraft<
    "depart" | "arrive" | null
  >("tzDisambigSide", editDisambig?.side ?? null);
  const selectTz = (c: TzCandidate) => {
    setTzRaw(c.tz);
    setTzDisambigTransitId(c.transitId);
    setTzDisambigSide(c.side);
  };
  // 今選ばれている日付に対する解決結果（single か 乗継日 ambiguous か）。
  const tzRes = useMemo(
    () => resolveExpenseTz(paidAtDate, payerTimeline),
    [paidAtDate, payerTimeline],
  );
  const multiTz = payerTimeline.transits.length > 0;

  const onDateChange = (newDate: string) => {
    setPaidAtDate(newDate);
    // 日付が変わったら TZ も推測し直す（乗継日は出発側を既定）。
    const r = resolveExpenseTz(newDate, payerTimeline);
    if (r.kind === "single") {
      setTzRaw(r.tz);
      setTzDisambigTransitId(null);
      setTzDisambigSide(null);
    } else {
      selectTz(r.options[0]);
    }
  };
  // 払った人が変わると年表も変わる（別行動していれば移動日の候補が違う）。
  // 選んでいた側がまだ候補にあれば保ち、無ければ日付を変えた時と同じ既定に戻す。
  const choosePayer = (id: string) => {
    setPayer(id);
    const r = resolveExpenseTz(paidAtDate, timelineFor(tzTimeline, [id]));
    if (r.kind === "single") {
      setTzRaw(r.tz);
      setTzDisambigTransitId(null);
      setTzDisambigSide(null);
      return;
    }
    const kept = r.options.find(
      (o) => o.transitId === tzDisambigTransitId && o.side === tzDisambigSide,
    );
    selectTz(kept ?? r.options[0]);
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
  const [visibility, setVisibility] = useDraft<Visibility>(
    "visibility",
    initVisibility,
  );
  const [selectedSplits, setSelectedSplits] = useDraft<Set<string>>(
    "selectedSplits",
    initSplits,
  );

  // 割り勘対象の "全員 / 一部" モード（event-form の参加者と同じ disclosure）。
  // 編集時のモードは保存された split_everyone がそのまま決める（選択内容が
  // たまたま全員と一致するかで推測しない）。
  const [splitMode, setSplitMode] = useDraft<"all" | "custom">(
    "splitMode",
    isEdit && !editExpense.split_everyone ? "custom" : "all",
  );

  // レート入力欄。currency 変更時は初期値に戻す。順序は実績の平均 → 取り込み時の
  // 市場レート（draftRate.ts。RN と共通）。丸めて入れる（未変更ならこの値が
  // 送信される＝半端な桁を残さない。編集時の保存済み値は実データなので丸めず
  // そのまま表示）。
  const rateOf = (c: Currency) =>
    initialRate({
      currency: c,
      defaultCurrency,
      averageRates,
      draft: fxRates ? { initialCurrency, fxRates } : null,
    });
  const rateFor = (c: Currency): string => {
    const r = rateOf(c);
    return r === null ? "" : r.source === "same" ? "1" : formatRate(r.rate);
  };
  // 値の出どころを一言添える（何も無ければ「1 USD = ? JPY」のガイド）。
  const rateHint = (r: ReturnType<typeof rateOf>): string =>
    r === null || r.source === "same"
      ? t("unknownRate", { from: localCurrency, to: defaultCurrency })
      : t(r.source === "average" ? "averageRate" : "marketRate", {
          from: localCurrency,
          rate: formatRate(r.rate),
          to: defaultCurrency,
        });
  const [rateInput, setRateInput] = useDraft<string>("rateInput", () =>
    isEdit ? String(editExpense.rate_to_default) : rateFor(initCurrency),
  );

  const formRef = useRef<HTMLFormElement>(null);
  const noteId = useId();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      clearDraft(); // 成功＝この下書きは用済み。次に開いたら真っさら（シート時のみ実体あり）。
      onSuccess?.(state.expenseId); // 成功時のみ（取り込み下書きを確定済みにする等）
      onDone?.(); // 成功で閉じる
    }
  }, [state.ok, state.expenseId, onSuccess, onDone, clearDraft]);

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
  // 「全員」は具体的な ID を焼き込まない（後から加わった人も含まれるように）。
  const submittedSplitEveryone = !submittedSplittable || splitMode === "all";
  const submittedSplitIds: string[] = submittedSplitEveryone
    ? []
    : Array.from(selectedSplits);

  // disclosure ラベルは選択状態から決める。
  //  - 全員選択 → "全員"
  //  - 自分のみ → "自分のみ"
  //  - その他   → "一部"
  const allSelectedNow =
    selectedSplits.size === members.length &&
    members.every((m) => selectedSplits.has(m.id));
  const splitLabel = onlySelf
    ? t("splitSelfOnly")
    : allSelectedNow
      ? t("splitAll")
      : t("splitSome");

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
      className={`relative space-y-3 p-4 ${inSheet ? "" : "rounded-md border border-foreground/10 bg-background"}`}
    >
      {/* × は専用行を作らず右上角に重ねる（ui-guidelines「× 閉じるは右上角」）。
          ボトムシート時は × を出さず下スワイプで閉じる（Instagram と同じ）。 */}
      {onDone && !inSheet && (
        <CloseButton onClick={onDone} className="absolute right-2 top-2 z-10" />
      )}

      {/* 価格はラベル無し＋placeholder＝フィールド名（iOS カレンダー方式）。
          隣の通貨セレクトは選択値（JPY 等）自体が説明になるのでラベル無しで高さを揃える。 */}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input
          type="number"
          name="local_price"
          required
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder={t("price")}
          aria-label={t("price")}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="block w-full"
        />
        <CurrencySelect
          name="local_currency"
          value={localCurrency}
          onChange={(v) => onCurrencyChange(v as Currency)}
          aria-label={t("currency")}
        />
      </div>

      {localCurrency !== defaultCurrency && (
        <label className="block text-sm">
          {/* ラベルは単位/方向を持たず「為替レート」だけ。方向は下のヒント行に実値付きで
              出す（平均があれば平均、無ければ ? のガイド）＝ `1 USD = 148 JPY` 形が一番明快。 */}
          <FieldLabel required>{t("exchangeRate")}</FieldLabel>
          <Input
            type="number"
            name="rate_to_default"
            required
            min="0"
            step="0.0001"
            inputMode="decimal"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            placeholder={
              rateOf(localCurrency)
                ? formatRate(rateOf(localCurrency)!.rate)
                : t("placeholderRate")
            }
            className="mt-1 block w-full"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            {rateHint(rateOf(localCurrency))}
          </span>
        </label>
      )}
      {localCurrency === defaultCurrency && (
        <input type="hidden" name="rate_to_default" value="1" />
      )}

      <div className="block text-sm">
        <FieldLabel>{t("category")}</FieldLabel>
        <CategorySelect
          name="category_id"
          categories={sortedCategories}
          value={categoryId}
          onChange={setCategoryId}
        />
      </div>

      <div className="block text-sm">
        {mapsApiKey ? (
          <APIProvider apiKey={mapsApiKey} language={locale}>
            <PlacePicker
              places={places}
              biasCenter={biasCenter}
              initial={placePickerInitial}
              autoResolve={autoResolvePlace}
              placeholder={t("place")}
            />
          </APIProvider>
        ) : (
          <PlacePicker
            places={places}
            biasCenter={biasCenter}
            initial={placePickerInitial}
            autoResolve={autoResolvePlace}
            placeholder={t("place")}
          />
        )}
      </div>

      {/* 支払者は常に hidden で送る（UI は公開範囲の下＝割り勘対象の隣に置く。下記参照）。
          自分のみ（private）の費用は自分の記録なので支払者は必ず自分に固定する。 */}
      <input
        type="hidden"
        name="payer_member_id"
        value={visibility === "private" ? myMemberId : payer}
      />

      {/* 日付（必須）＋時刻（任意・展開すると入れられる） */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0 text-sm">
          <FieldLabel required>{t("date")}</FieldLabel>
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
              <FieldLabel>{t("time")}</FieldLabel>
              <CloseButton
                onClick={collapseTime}
                label={t("removeTime")}
                className="h-5 w-5"
                iconSize={12}
              />
            </div>
            <Input
              ref={timeInputCallback}
              type="time"
              name="paid_at_time"
              required
              value={paidAtTime}
              onChange={(e) => setPaidAtTime(e.target.value)}
              className="mt-1 block w-full min-w-0"
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col text-sm">
            {/* 日付ラベルと縦位置を揃えるためのダミー */}
            <span aria-hidden className="invisible font-medium">
              {t("time")}
            </span>
            <button
              type="button"
              onClick={expandTime}
              className="mt-1 h-9 rounded-md border border-dashed border-foreground/20 px-3 text-xs text-muted-foreground transition hover:border-foreground/40 hover:bg-foreground/10 hover:text-foreground"
            >
              {t("addTime")}
            </button>
            <input type="hidden" name="paid_at_time" value="00:00" />
          </div>
        )}
      </div>

      {/* tz_disambig_* だけがサーバへ送る値（実TZ文字列は保存しないので tz
          自体は送らない、下の localTz 表示にだけ使う）。時刻を指定したときだけ
          意味を持つので、表示も showTime のときだけ。複数TZ旅程の通常日は
          控えめ表示、乗継日は出発/到着の2択。 */}
      <input
        type="hidden"
        name="tz_disambig_transit_id"
        value={tzDisambigTransitId ?? ""}
      />
      <input
        type="hidden"
        name="tz_disambig_side"
        value={tzDisambigSide ?? ""}
      />
      {showTime &&
        multiTz &&
        (tzRes.kind === "ambiguous" ? (
          <fieldset className="text-sm">
            <p className="text-xs text-muted-foreground">
              {t("transitDay")}
            </p>
            {/* 同じ TZ の候補は畳む（移動が複数あると重複して並ぶ）。選択状態も
                TZ 単位で照合する（実体の transitId/side は selectTz が保持）。 */}
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              {dedupeTzCandidates(tzRes.options).map((opt) => (
                <label key={opt.tz} className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="tz_choice"
                    checked={
                      tzRes.options.find(
                        (o) =>
                          o.transitId === tzDisambigTransitId &&
                          o.side === tzDisambigSide,
                      )?.tz === opt.tz
                    }
                    onChange={() => selectTz(opt)}
                  />
                  <span>{tzLabel(opt.tz)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("localTz", { tz: tzLabel(tz) })}
          </p>
        ))}

      {/* メモは費用の説明を兼ねるので「細々したオプション（公開範囲・支払者・割り勘）」より
          上に置く（日付の下）。最下は設定系オプションに固める。 */}
      <Input
        id={noteId}
        type="text"
        name="note"
        placeholder={t("memo")}
        aria-label={t("memo")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="block w-full"
      />

      {/* 公開範囲は予定フォームと同じくラベル＋選択肢を1行インラインに（ラベルは text-sm で
          他のフィールドラベルと揃える）。 */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{t("visibility")}</span>
        {canChangeVisibility ? (
          <div className="flex gap-3" role="radiogroup" aria-label={t("visibility")}>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="visibility"
                value="shared"
                checked={visibility === "shared"}
                onChange={() => setVisibility("shared")}
              />
              <span>{tCommon("shared")}</span>
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="visibility"
                value="private"
                checked={visibility === "private"}
                onChange={() => setVisibility("private")}
              />
              <span>{tCommon("selfOnly")}</span>
            </label>
          </div>
        ) : (
          <>
            <span className="text-muted-foreground">
              {visibility === "shared" ? tCommon("shared") : tCommon("selfOnly")}
            </span>
            <input type="hidden" name="visibility" value={visibility} />
          </>
        )}
      </div>

      {/* 支払った人。割り勘対象と同じ「メンバー選択」なので隣に置く。既定は自分＝普通は
          入力者なので折りたたみ（あまり触らない）。タップで展開して別の人に変更。
          自分のみ（private）や メンバー1人の旅行では常に自分なので UI 省略（hidden は上で送る）。 */}
      {visibility === "shared" && members.length > 1 && (
        <div className="text-sm">
          <button
            type="button"
            onClick={() => setPayerOpen((v) => !v)}
            aria-expanded={payerOpen}
            className="inline-flex items-center gap-1 rounded font-medium text-muted-foreground transition hover:text-foreground"
          >
            <span>
              {t("payer", { name: members.find((m) => m.id === payer)?.display_name ?? "?" })}
            </span>
            <ChevronIcon
              size={16}
              className={`transition-transform ${payerOpen ? "-rotate-90" : "rotate-90"}`}
            />
          </button>
          {payerOpen && (
            // 割り勘対象と同じチップ選択に揃える（UI 統一）。ただし支払者は1人なので
            // 単一選択＝タップしたメンバーだけ on になり他は外れる。
            <div className="mt-1.5 flex flex-wrap gap-1">
              {members.map((m) => (
                <ToggleChip
                  key={m.id}
                  on={m.id === payer}
                  hue={m.color}
                  onClick={() => choosePayer(m.id)}
                >
                  {m.display_name}
                </ToggleChip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 割り勘対象。event-form の参加者と同じ disclosure + chip パターン。
          デフォルトは「割り勘対象: 全員」＋下向きシェブロン。タップで展開してチップで選択。
          展開状態は選択内容で「全員」「一部」「自分のみ」＋上向きシェブロンに切り替わる。
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
            <span>{t("splitTargets", { label: splitMode === "all" ? t("splitAll") : splitLabel })}</span>
            <ChevronIcon
              size={16}
              className={`transition-transform ${splitMode === "all" ? "rotate-90" : "-rotate-90"}`}
            />
          </button>
          {splitMode === "custom" && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {members.map((m) => {
                const on = selectedSplits.has(m.id);
                return (
                  <ToggleChip
                    key={m.id}
                    on={on}
                    hue={m.color}
                    onClick={() => toggleSplit(m.id)}
                  >
                    {m.display_name}
                  </ToggleChip>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 送信用 hidden inputs。"自分のみ" は splittable=false、それ以外は
          splittable=true。全員かどうかは split_everyone で明示的に送る
          （ID の有無から推測させない）。 */}
      {submittedSplittable && (
        <input type="hidden" name="splittable" value="on" />
      )}
      <input
        type="hidden"
        name="split_everyone"
        value={submittedSplitEveryone ? "1" : "0"}
      />
      {submittedSplitIds.map((id) => (
        <input key={id} type="hidden" name="split_member_ids" value={id} />
      ))}

      <div className="flex gap-2">
        {canDelete && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={onDelete}
            disabled={isDeleting}
            aria-label={tCommon("delete")}
            title={tCommon("delete")}
            className="shrink-0"
          >
            <TrashIcon size={18} />
          </Button>
        )}
        <SubmitButton
          busy={isPending}
          // 必須（価格）は * でなく「埋まるまで送信無効」で表現（iOS 方式）。
          // 換算通貨が違う時だけ為替レートも必須（履歴が無いと空文字始まり
          // ＝ input の required だけに頼らず埋まるまで無効にする）。
          disabled={
            price.trim() === "" ||
            (localCurrency !== defaultCurrency && rateInput.trim() === "")
          }
          aria-label={isEdit ? tCommon("save") : tCommon("add")}
          title={isEdit ? tCommon("save") : tCommon("add")}
          className="flex-1"
        >
          {isEdit ? <SaveIcon size={20} /> : <PlusIcon size={20} />}
        </SubmitButton>
      </div>

      {state.error && (
        <MessageBox kind="error">{state.error}</MessageBox>
      )}
    </form>
  );
}
