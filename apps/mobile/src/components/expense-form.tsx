import DateTimePicker from "@react-native-community/datetimepicker";
import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// フォーム本体はボトムシート側の BottomSheetScrollView がスクロールを持つので、
// ルートは View（二重スクロール回避）。通貨モーダルの中だけ ScrollView を使う。
import { useTranslations } from "use-intl";

import {
  ALL_CURRENCIES,
  COMMON_CURRENCIES,
  CURRENCY_NAMES,
} from "@triplot/shared/currencies";
import type { PlaceInput } from "@triplot/shared/data/place";
import {
  createExpense,
  deleteExpense,
  updateExpense,
  type ExpenseFields,
} from "@triplot/shared/data/expenses";
import { formatRate } from "@triplot/shared/formatRate";
import type { ExpenseDraftItem } from "@triplot/shared/import/drafts";
import {
  dedupeTzCandidates,
  resolveExpenseTz,
  type TripTzTimeline,
  type TzCandidate,
} from "@triplot/shared/schedule";
import type { Category, ExpenseRow } from "@triplot/shared/tripDerive";
import type { Currency, Visibility } from "@triplot/shared/types/database";

import { ExpenseCategoryIcon } from "./expense-category-icon";
import { CheckIcon, ChevronIcon, PlusIcon, TrashIcon, XIcon } from "./icons";
import { PlacePicker } from "./place-picker";
import { ToggleChip } from "./toggle-chip";
import { CompactSegment, VisibilitySegment } from "./visibility-segment";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

type Member = {
  id: string;
  display_name: string;
  color: number | null;
};

// 費用フォーム（RN 版）。web の components/expense-form.tsx と同じ入力項目・
// 同じ導出ロジック（splittable/split_member_ids・TZ再解決・レート既定）。
// 検証後は shared の createExpense/updateExpense を直接呼ぶ（server action 不要、
// RLS + RPC 内検証が守る）。
export function ExpenseForm({
  tripId,
  members,
  myMemberId,
  defaultCurrency,
  initialCurrency,
  categories,
  initialCategoryId,
  averageRates,
  initialPaidAt,
  places,
  tzTimeline,
  editExpense,
  draft,
  onDone,
  onSuccess,
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
  tzTimeline: TripTzTimeline;
  editExpense?: ExpenseRow;
  // メール取り込みの未確定下書きの確定フロー。create モードの事前入力として
  // 使う（editExpense と排他）。確定処理自体は onSuccess 側（呼び出し元）。
  draft?: ExpenseDraftItem;
  onDone: () => void;
  // 追加/更新が成功したときだけ呼ぶ（キャンセルでは呼ばれない）。追加成功時は
  // 作成した費用の id が渡る（取り込み下書きの確定リンクに使う）。
  onSuccess?: (expenseId?: string) => void;
}) {
  const t = useTranslations("expense");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isEdit = !!editExpense;

  const [price, setPrice] = useState(
    isEdit
      ? String(editExpense.local_price)
      : draft
        ? String(draft.initialPrice)
        : "",
  );
  const [localCurrency, setLocalCurrency] = useState<Currency>(
    isEdit
      ? editExpense.local_currency
      : (draft?.initialCurrency ?? initialCurrency),
  );
  const rateFor = (c: Currency): string => {
    if (c === defaultCurrency) return "1";
    const avg = averageRates[c];
    return avg !== undefined ? formatRate(avg) : "";
  };
  const [rateInput, setRateInput] = useState(() =>
    isEdit ? String(editExpense.rate_to_default) : rateFor(localCurrency),
  );
  const [categoryId, setCategoryId] = useState(
    isEdit
      ? editExpense.category_id
      : (draft?.initialCategoryId ?? initialCategoryId),
  );
  const [place, setPlace] = useState<PlaceInput>(() => {
    if (isEdit) return { kind: "saved", placeId: editExpense.place_id };
    // 下書き: 保存済みマッチはそれを、無ければ抽出した店名を自由入力テキスト
    // として事前入力（RN は Google 自動解決を持たないので web の低確信時と同じ
    // 自由入力フォールバック）。
    if (draft?.initialPlace)
      return { kind: "saved", placeId: draft.initialPlace.id };
    if (draft?.autoResolvePlace)
      return { kind: "free", label: draft.autoResolvePlace.name };
    return { kind: "saved", placeId: null };
  });
  const [note, setNote] = useState(isEdit ? (editExpense.note ?? "") : "");
  const [visibility, setVisibility] = useState<Visibility>(
    isEdit ? editExpense.visibility : "shared",
  );
  const [payer, setPayer] = useState(
    isEdit ? editExpense.payer_member_id : myMemberId,
  );
  const [payerOpen, setPayerOpen] = useState(false);

  // 日付と時刻。時刻は「指定したい人だけ」展開するトグル（未展開は 00:00 送信
  // ＝一覧で時刻非表示。web と同じ）。
  const initPaidAtDate = isEdit
    ? editExpense.paid_at.slice(0, 10)
    : (draft?.initialPaidAt ?? initialPaidAt);
  const initPaidAtTime = isEdit
    ? editExpense.paid_at.slice(11, 16)
    : (draft?.initialTime ?? "00:00");
  const [paidAtDate, setPaidAtDate] = useState(initPaidAtDate);
  const [paidAtTime, setPaidAtTime] = useState(initPaidAtTime);
  const [showTime, setShowTime] = useState(initPaidAtTime !== "00:00");

  // 費用の発生TZ（乗継日の曖昧解決）。web と同じ契約。
  const initResolution = resolveExpenseTz(initPaidAtDate, tzTimeline);
  const editDisambig =
    isEdit && initResolution.kind === "ambiguous"
      ? editExpense.tzDisambigTransitId && editExpense.tzDisambigSide
        ? {
            transitId: editExpense.tzDisambigTransitId,
            side: editExpense.tzDisambigSide,
          }
        : initResolution.options[0]
      : null;
  const [tzDisambigTransitId, setTzDisambigTransitId] = useState<string | null>(
    editDisambig?.transitId ?? null,
  );
  const [tzDisambigSide, setTzDisambigSide] = useState<
    "depart" | "arrive" | null
  >(editDisambig?.side ?? null);
  const selectTz = (c: TzCandidate) => {
    setTzDisambigTransitId(c.transitId);
    setTzDisambigSide(c.side);
  };
  const tzRes = useMemo(
    () => resolveExpenseTz(paidAtDate, tzTimeline),
    [paidAtDate, tzTimeline],
  );
  const multiTz = tzTimeline.transits.length > 0;
  const currentTz =
    tzRes.kind === "single"
      ? tzRes.tz
      : (tzRes.options.find(
          (o) => o.transitId === tzDisambigTransitId && o.side === tzDisambigSide,
        )?.tz ?? tzRes.options[0].tz);

  const onDateChange = (newDate: string) => {
    setPaidAtDate(newDate);
    const r = resolveExpenseTz(newDate, tzTimeline);
    if (r.kind === "single") {
      setTzDisambigTransitId(null);
      setTzDisambigSide(null);
    } else {
      selectTz(r.options[0]);
    }
  };

  // 割り勘対象（web と同じ導出）。
  const initOnlySelf = isEdit && !editExpense.splittable;
  const [selectedSplits, setSelectedSplits] = useState<Set<string>>(() =>
    initOnlySelf
      ? new Set([myMemberId])
      : isEdit
        ? new Set(editExpense.split_member_ids)
        : new Set(members.map((m) => m.id)),
  );
  const splitsMatchAll =
    selectedSplits.size === members.length &&
    members.every((m) => selectedSplits.has(m.id));
  const [splitMode, setSplitMode] = useState<"all" | "custom">(
    isEdit && !splitsMatchAll ? "custom" : "all",
  );
  const toggleSplit = (id: string) => {
    setSelectedSplits((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id); // 最後の1人は外せない
      } else {
        next.add(id);
      }
      return next;
    });
  };
  const onlySelf = selectedSplits.size === 1 && selectedSplits.has(myMemberId);
  const splittable = visibility === "shared" && !onlySelf;
  const splitIds = !splittable
    ? []
    : splitMode === "all"
      ? members.map((m) => m.id)
      : Array.from(selectedSplits);
  const splitLabel = onlySelf
    ? t("splitSelfOnly")
    : splitsMatchAll
      ? t("splitAll")
      : t("splitSome");

  // 通貨選択（COMMON を先頭に、以降は全通貨）。
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const currencyChoices = useMemo(() => {
    const rest = ALL_CURRENCIES.filter((c) => !COMMON_CURRENCIES.includes(c));
    return [...COMMON_CURRENCIES, ...rest];
  }, []);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sort_order - b.sort_order),
    [categories],
  );
  const selectedCategory =
    sortedCategories.find((c) => c.id === categoryId) ?? null;

  const canDelete =
    !!editExpense &&
    (editExpense.visibility === "private"
      ? editExpense.created_by_member_id === myMemberId
      : true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const priceNum = Number(price);
    const rateNum = localCurrency === defaultCurrency ? 1 : Number(rateInput);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError(`${t("price")}?`);
      return;
    }
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      setError(`${t("exchangeRate")}?`);
      return;
    }
    setBusy(true);
    setError(null);
    const fields: ExpenseFields = {
      localPrice: priceNum,
      localCurrency,
      rateToDefault: rateNum,
      categoryId,
      payerMemberId: visibility === "private" ? myMemberId : payer,
      visibility,
      splittable,
      note: note.trim(),
      paidAt: `${paidAtDate}T${showTime ? paidAtTime : "00:00"}`,
      tzDisambigTransitId,
      tzDisambigSide,
      splitMemberIds: splitIds,
      place,
    };
    if (isEdit) {
      const result = await updateExpense(supabase, editExpense.id, fields);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    } else {
      const result = await createExpense(supabase, tripId, fields);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // 作成した費用の id を渡す（取り込み下書きの確定リンクに使う）。
      onSuccess?.(result.data);
    }
    onDone();
  };

  const onDelete = () => {
    if (!editExpense) return;
    Alert.alert(t("deleteTitle"), undefined, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          void deleteExpense(supabase, editExpense.id).then((r) => {
            if (!r.ok) {
              Alert.alert(t("deleteFailed", { error: r.error }));
              return;
            }
            onDone();
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.content}>
      {/* 価格 + 通貨: ラベル無し＋placeholder＝フィールド名（iOS カレンダー方式）。
          必須は * でなく「埋まるまで送信無効」。通貨は選択値（JPY 等）自体が説明。 */}
      <View style={styles.row2}>
        <View style={styles.grow}>
          <TextInput
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder={t("price")}
            accessibilityLabel={t("price")}
            placeholderTextColor={theme.subtleForeground}
            style={styles.input}
          />
        </View>
        <Pressable
          onPress={() => setCurrencyOpen(true)}
          accessibilityLabel={t("currency")}
          style={[styles.input, styles.selectTrigger]}
        >
          <Text style={styles.selectText}>{localCurrency}</Text>
          <ChevronIcon size={14} color={theme.subtleForeground} rotate={90} />
        </Pressable>
      </View>

      {/* 為替レート（外貨のときだけ） */}
      {localCurrency !== defaultCurrency && (
        <View>
          <Text style={styles.label}>
            {t("exchangeRate")} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            value={rateInput}
            onChangeText={setRateInput}
            keyboardType="decimal-pad"
            placeholder={
              averageRates[localCurrency] !== undefined
                ? formatRate(averageRates[localCurrency]!)
                : t("placeholderRate")
            }
            placeholderTextColor={theme.subtleForeground}
            style={styles.input}
          />
          <Text style={styles.hint}>
            {averageRates[localCurrency] !== undefined
              ? t("averageRate", {
                  from: localCurrency,
                  rate: formatRate(averageRates[localCurrency]!),
                  to: defaultCurrency,
                })
              : t("unknownRate", { from: localCurrency, to: defaultCurrency })}
          </Text>
        </View>
      )}

      {/* カテゴリ: web のドロップダウン相当＝選択値トリガ→タップでリスト。
          ラベル左・トリガ右で1行（チップ全展開をやめて縦を節約）。 */}
      <View style={styles.inlineRow}>
        <Text style={[styles.label, styles.labelInline]}>{t("category")}</Text>
        <Pressable
          onPress={() => setCategoryOpen(true)}
          accessibilityLabel={t("category")}
          style={[styles.input, styles.selectTrigger, styles.growTrigger]}
        >
          <View style={styles.categoryValue}>
            {selectedCategory && (
              <ExpenseCategoryIcon
                icon={selectedCategory.icon}
                size={16}
                color={selectedCategory.color}
              />
            )}
            <Text style={styles.selectText}>
              {selectedCategory?.name ?? ""}
            </Text>
          </View>
          <ChevronIcon size={14} color={theme.subtleForeground} rotate={90} />
        </Pressable>
      </View>

      {/* 場所 */}
      <PlacePicker
        places={places}
        value={place}
        onChange={setPlace}
        placeholder={t("place")}
      />

      {/* 日付＋時刻: 予定フォームの開始/終了と同形の「ラベル左・チップ右」1行。
          時刻は任意＝「＋時刻を指定」で追加、× でやめる。 */}
      <View style={styles.dtRow}>
        <Text style={[styles.label, styles.labelInline]}>{t("date")}</Text>
        <View style={styles.dtPickers}>
          <DateTimePicker
            value={new Date(`${paidAtDate}T12:00:00`)}
            mode="date"
            display="compact"
            onChange={(_, d) => {
              if (d) onDateChange(formatLocalDate(d));
            }}
          />
          {showTime ? (
            <>
              <DateTimePicker
                value={new Date(`${paidAtDate}T${paidAtTime}:00`)}
                mode="time"
                display="compact"
                onChange={(_, d) => {
                  if (d) setPaidAtTime(formatLocalTime(d));
                }}
              />
              <Pressable
                onPress={() => {
                  setPaidAtTime("00:00");
                  setShowTime(false);
                }}
                hitSlop={8}
                accessibilityLabel={t("removeTime")}
              >
                <XIcon size={16} color={theme.mutedForeground} />
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => {
                setPaidAtTime("12:00");
                setShowTime(true);
              }}
              style={styles.addTime}
            >
              <Text style={styles.addTimeText}>{t("addTime")}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* 乗継日の TZ 選択（時刻指定時のみ・web と同じ契約）。セグメント＋
          同一 TZ の候補は畳む（予定フォームと同じ）。 */}
      {showTime &&
        multiTz &&
        (tzRes.kind === "ambiguous" ? (
          <View>
            <Text style={styles.hint}>{t("transitDay")}</Text>
            <View style={styles.tzOptions}>
              <CompactSegment
                options={dedupeTzCandidates(tzRes.options).map((opt) => ({
                  key: opt.tz,
                  label: opt.tz,
                }))}
                value={
                  tzRes.options.find(
                    (o) =>
                      o.transitId === tzDisambigTransitId &&
                      o.side === tzDisambigSide,
                  )?.tz ?? ""
                }
                onChange={(tz) => {
                  const opt = tzRes.options.find((o) => o.tz === tz);
                  if (opt) selectTz(opt);
                }}
              />
            </View>
          </View>
        ) : (
          <Text style={styles.hint}>{t("localTz", { tz: currentTz })}</Text>
        ))}

      {/* メモ */}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t("memo")}
        accessibilityLabel={t("memo")}
        placeholderTextColor={theme.subtleForeground}
        style={styles.input}
      />

      {/* 公開範囲: iOS 標準の排他選択＝セグメント。 */}
      <View style={styles.inlineRow}>
        <Text style={[styles.label, styles.labelInline]}>
          {t("visibility")}
        </Text>
        <VisibilitySegment value={visibility} onChange={setVisibility} />
      </View>

      {/* 支払った人（shared かつ複数メンバーのときだけ・既定は自分で折りたたみ） */}
      {visibility === "shared" && members.length > 1 && (
        <View>
          <Pressable
            onPress={() => setPayerOpen((v) => !v)}
            style={styles.disclosure}
          >
            <Text style={styles.disclosureLabel}>
              {t("payer", {
                name:
                  members.find((m) => m.id === payer)?.display_name ?? "?",
              })}
            </Text>
            <ChevronIcon
              size={16}
              color={theme.subtleForeground}
              rotate={payerOpen ? -90 : 90}
            />
          </Pressable>
          {payerOpen && (
            <View style={styles.chipWrap}>
              {members.map((m) => (
                <ToggleChip
                  key={m.id}
                  on={m.id === payer}
                  hue={m.color}
                  label={m.display_name}
                  onPress={() => setPayer(m.id)}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* 割り勘対象 */}
      {visibility === "shared" && members.length > 1 && (
        <View>
          <Pressable
            onPress={() => {
              if (splitMode === "all") {
                setSplitMode("custom");
              } else {
                setSplitMode("all");
                setSelectedSplits(new Set(members.map((m) => m.id)));
              }
            }}
            style={styles.disclosure}
          >
            <Text style={styles.disclosureLabel}>
              {t("splitTargets", {
                label: splitMode === "all" ? t("splitAll") : splitLabel,
              })}
            </Text>
            <ChevronIcon
              size={16}
              color={theme.subtleForeground}
              rotate={splitMode === "all" ? 90 : -90}
            />
          </Pressable>
          {splitMode === "custom" && (
            <View style={styles.chipWrap}>
              {members.map((m) => (
                <ToggleChip
                  key={m.id}
                  on={selectedSplits.has(m.id)}
                  hue={m.color}
                  label={m.display_name}
                  onPress={() => toggleSplit(m.id)}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* フッター: [削除(編集時)] + [送信 flex-1]（web のフォームフッターと同型） */}
      <View style={styles.footer}>
        {canDelete && (
          <Pressable
            onPress={onDelete}
            style={styles.deleteButton}
            accessibilityLabel="削除"
          >
            <TrashIcon size={18} color={theme.destructiveText} />
          </Pressable>
        )}
        <Pressable
          onPress={() => void submit()}
          // 必須（価格）は * でなく「埋まるまで送信無効」で表現（iOS 方式）。
          disabled={busy || price.trim() === ""}
          style={[
            styles.submitButton,
            (busy || price.trim() === "") && styles.disabled,
          ]}
          accessibilityLabel={isEdit ? "保存" : t("addAria")}
        >
          <PlusIcon size={20} color={theme.primaryForeground} />
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {/* 通貨選択モーダル。ヘッダーに × を置いて「選ばずに閉じる」を明示
          （pageSheet の下スワイプでも閉じられるが分かりにくいため）。
          各行は web と同じ「コード + 通貨名」。 */}
      <Modal
        visible={currencyOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCurrencyOpen(false)}
      >
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{t("currency")}</Text>
            <Pressable
              onPress={() => setCurrencyOpen(false)}
              hitSlop={8}
              accessibilityLabel="閉じる"
            >
              <XIcon size={20} color={theme.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.pickerList}>
            {currencyChoices.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  setLocalCurrency(c);
                  setRateInput(rateFor(c));
                  setCurrencyOpen(false);
                }}
                style={styles.pickerRow}
              >
                <Text
                  style={[
                    styles.currencyCode,
                    c === localCurrency && styles.pickerTextOn,
                  ]}
                >
                  {c}
                </Text>
                <Text style={styles.pickerSub} numberOfLines={1}>
                  {CURRENCY_NAMES[c] ?? ""}
                </Text>
                {c === localCurrency && (
                  <CheckIcon size={16} color={theme.foreground} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* カテゴリ選択モーダル（通貨と同形）。 */}
      <Modal
        visible={categoryOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCategoryOpen(false)}
      >
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{t("category")}</Text>
            <Pressable
              onPress={() => setCategoryOpen(false)}
              hitSlop={8}
              accessibilityLabel="閉じる"
            >
              <XIcon size={20} color={theme.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.pickerList}>
            {sortedCategories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => {
                  setCategoryId(c.id);
                  setCategoryOpen(false);
                }}
                style={styles.pickerRow}
              >
                <ExpenseCategoryIcon icon={c.icon} size={18} color={c.color} />
                <Text
                  style={[
                    styles.pickerText,
                    c.id === categoryId && styles.pickerTextOn,
                  ]}
                >
                  {c.name}
                </Text>
                {c.id === categoryId && (
                  <CheckIcon size={16} color={theme.foreground} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// DateTimePicker の Date → ローカル日付/時刻文字列（UTC ずれ防止のため手組み）。
function formatLocalDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function formatLocalTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 14, paddingBottom: 48 },
    row2: { flexDirection: "row", gap: 8 },
    grow: { flex: 1 },
    label: {
      fontSize: 13,
      fontWeight: "500",
      marginBottom: 4,
      color: t.foreground,
    },
    required: { color: t.destructiveText },
    input: {
      height: 36,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 10,
      fontSize: 14,
      minWidth: 72,
      color: t.foreground,
    },
    selectTrigger: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 6,
    },
    // ラベル左の行でトリガに残り幅を使わせる。
    growTrigger: { flex: 1 },
    selectText: { fontSize: 14, color: t.foreground },
    categoryValue: { flexDirection: "row", alignItems: "center", gap: 6 },
    hint: { marginTop: 4, fontSize: 12, color: t.mutedForeground },
    // 日付＋時刻の「ラベル左・チップ右」行（予定フォームの開始/終了と同形）。
    dtRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    dtPickers: { flexDirection: "row", alignItems: "center", gap: 8 },
    // label の marginBottom は上置き用なので、横並び行では打ち消す。
    labelInline: { marginBottom: 0 },
    addTime: {
      height: 36,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
    },
    addTimeText: { fontSize: 12, color: t.mutedForeground },
    // TZ曖昧解決のラジオは横並び（web と同じ。縦積みは場所を食う）。
    tzOptions: {
      marginTop: 6,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    inlineRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    disclosure: { flexDirection: "row", alignItems: "center", gap: 4 },
    disclosureLabel: {
      fontSize: 13,
      fontWeight: "500",
      color: t.mutedForeground,
    },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
    footer: { flexDirection: "row", gap: 8, marginTop: 8 },
    deleteButton: {
      width: 44,
      height: 44,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.destructiveBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    submitButton: {
      flex: 1,
      height: 44,
      borderRadius: 6,
      backgroundColor: t.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    disabled: { opacity: 0.5 },
    error: {
      fontSize: 13,
      color: t.errorText,
      backgroundColor: t.errorBg,
      borderRadius: 6,
      padding: 10,
    },
    // 通貨/カテゴリ選択モーダル共通（ヘッダー＝タイトル＋×、行＝値＋補足＋✓）。
    pickerSheet: { flex: 1, backgroundColor: t.background },
    pickerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.1),
    },
    pickerTitle: { fontSize: 15, fontWeight: "600", color: t.foreground },
    pickerList: { padding: 16, paddingTop: 4 },
    pickerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.08),
    },
    currencyCode: {
      fontSize: 15,
      color: t.foreground,
      fontVariant: ["tabular-nums"],
      width: 48,
    },
    pickerText: { fontSize: 15, color: t.foreground, flex: 1 },
    pickerSub: { fontSize: 13, color: t.mutedForeground, flex: 1 },
    pickerTextOn: { fontWeight: "700" },
  });
