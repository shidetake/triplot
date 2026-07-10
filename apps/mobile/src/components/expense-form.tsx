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
  resolveExpenseTz,
  type TripTzTimeline,
  type TzCandidate,
} from "@triplot/shared/schedule";
import type { Category, ExpenseRow } from "@triplot/shared/tripDerive";
import type { Currency, Visibility } from "@triplot/shared/types/database";

import { ExpenseCategoryIcon } from "./expense-category-icon";
import { ChevronIcon, PlusIcon, TrashIcon } from "./icons";
import { PlacePicker } from "./place-picker";
import { ToggleChip } from "./toggle-chip";
import { supabase } from "@/lib/supabase";

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
  const currencyChoices = useMemo(() => {
    const rest = ALL_CURRENCIES.filter((c) => !COMMON_CURRENCIES.includes(c));
    return [...COMMON_CURRENCIES, ...rest];
  }, []);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sort_order - b.sort_order),
    [categories],
  );

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
      {/* 価格 + 通貨 */}
      <View style={styles.row2}>
        <View style={styles.grow}>
          <Text style={styles.label}>
            {t("price")} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="rgba(0,0,0,0.38)"
            style={styles.input}
          />
        </View>
        <View>
          <Text style={styles.label}>{t("currency")}</Text>
          <Pressable
            onPress={() => setCurrencyOpen(true)}
            style={[styles.input, styles.selectTrigger]}
          >
            <Text style={styles.selectText}>{localCurrency}</Text>
            <ChevronIcon size={14} color="rgba(0,0,0,0.45)" rotate={90} />
          </Pressable>
        </View>
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
            placeholderTextColor="rgba(0,0,0,0.38)"
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

      {/* カテゴリ */}
      <View>
        <Text style={styles.label}>{t("category")}</Text>
        <View style={styles.categoryWrap}>
          {sortedCategories.map((c) => {
            const on = c.id === categoryId;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(c.id)}
                style={[styles.categoryChip, on && styles.categoryChipOn]}
              >
                <ExpenseCategoryIcon
                  icon={c.icon}
                  size={14}
                  color={on ? "#fff" : c.color}
                />
                <Text
                  style={[
                    styles.categoryLabel,
                    on && styles.categoryLabelOn,
                  ]}
                >
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 場所 */}
      <View>
        <Text style={styles.label}>{t("place")}</Text>
        <PlacePicker places={places} value={place} onChange={setPlace} />
      </View>

      {/* 日付 + 時刻 */}
      <View style={styles.row2}>
        <View style={styles.grow}>
          <Text style={styles.label}>
            {t("date")} <Text style={styles.required}>*</Text>
          </Text>
          <DateTimePicker
            value={new Date(`${paidAtDate}T12:00:00`)}
            mode="date"
            display="compact"
            onChange={(_, d) => {
              if (d) onDateChange(formatLocalDate(d));
            }}
            style={styles.datePicker}
          />
        </View>
        <View style={styles.grow}>
          {showTime ? (
            <>
              <View style={styles.timeHeader}>
                <Text style={styles.label}>{t("time")}</Text>
                <Pressable
                  onPress={() => {
                    setPaidAtTime("00:00");
                    setShowTime(false);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.removeTime}>{t("removeTime")}</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={new Date(`${paidAtDate}T${paidAtTime}:00`)}
                mode="time"
                display="compact"
                onChange={(_, d) => {
                  if (d) setPaidAtTime(formatLocalTime(d));
                }}
                style={styles.datePicker}
              />
            </>
          ) : (
            <>
              <Text style={[styles.label, styles.invisible]}>{t("time")}</Text>
              <Pressable
                onPress={() => {
                  setPaidAtTime("12:00");
                  setShowTime(true);
                }}
                style={styles.addTime}
              >
                <Text style={styles.addTimeText}>{t("addTime")}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* 乗継日の TZ 選択（時刻指定時のみ・web と同じ契約） */}
      {showTime &&
        multiTz &&
        (tzRes.kind === "ambiguous" ? (
          <View>
            <Text style={styles.hint}>{t("transitDay")}</Text>
            <View style={styles.tzOptions}>
              {tzRes.options.map((opt) => {
                const on =
                  tzDisambigTransitId === opt.transitId &&
                  tzDisambigSide === opt.side;
                return (
                  <Pressable
                    key={`${opt.transitId}-${opt.side}`}
                    onPress={() => selectTz(opt)}
                    style={styles.tzOption}
                  >
                    <View style={[styles.radio, on && styles.radioOn]} />
                    <Text style={styles.tzOptionLabel}>{opt.tz}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <Text style={styles.hint}>{t("localTz", { tz: currentTz })}</Text>
        ))}

      {/* メモ */}
      <View>
        <Text style={styles.label}>{t("memo")}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t("placeholderMemo")}
          placeholderTextColor="rgba(0,0,0,0.38)"
          style={styles.input}
        />
      </View>

      {/* 公開範囲 */}
      <View style={styles.inlineRow}>
        <Text style={styles.label}>{t("visibility")}</Text>
        {(["shared", "private"] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => setVisibility(v)}
            style={styles.tzOption}
          >
            <View style={[styles.radio, visibility === v && styles.radioOn]} />
            <Text style={styles.radioLabel}>
              {v === "shared" ? t("visibilityShared") : t("visibilitySelfOnly")}
            </Text>
          </Pressable>
        ))}
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
              color="rgba(0,0,0,0.45)"
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
              color="rgba(0,0,0,0.45)"
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
            <TrashIcon size={18} color="#dc2626" />
          </Pressable>
        )}
        <Pressable
          onPress={() => void submit()}
          disabled={busy}
          style={[styles.submitButton, busy && styles.disabled]}
          accessibilityLabel={isEdit ? "保存" : t("addAria")}
        >
          <PlusIcon size={20} color="#fff" />
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {/* 通貨選択モーダル */}
      <Modal
        visible={currencyOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCurrencyOpen(false)}
      >
        <ScrollView contentContainerStyle={styles.currencyList}>
          {currencyChoices.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                setLocalCurrency(c);
                setRateInput(rateFor(c));
                setCurrencyOpen(false);
              }}
              style={styles.currencyRow}
            >
              <Text
                style={[
                  styles.currencyText,
                  c === localCurrency && styles.currencyTextOn,
                ]}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
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

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  row2: { flexDirection: "row", gap: 8 },
  grow: { flex: 1 },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 4 },
  required: { color: "#dc2626" },
  invisible: { opacity: 0 },
  input: {
    height: 36,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    minWidth: 72,
  },
  selectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  selectText: { fontSize: 14 },
  hint: { marginTop: 4, fontSize: 12, color: "rgba(0,0,0,0.6)" },
  categoryWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  categoryChipOn: { backgroundColor: "#09090b", borderColor: "#09090b" },
  categoryLabel: { fontSize: 12 },
  categoryLabelOn: { color: "#fff" },
  datePicker: { alignSelf: "flex-start", marginLeft: -8 },
  timeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  removeTime: { fontSize: 11, color: "rgba(0,0,0,0.5)" },
  addTime: {
    height: 36,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(0,0,0,0.2)",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  addTimeText: { fontSize: 12, color: "rgba(0,0,0,0.6)" },
  tzOptions: { marginTop: 6, gap: 6 },
  tzOption: { flexDirection: "row", alignItems: "center", gap: 6 },
  tzOptionLabel: { fontSize: 13 },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.35)",
  },
  radioOn: { borderWidth: 5, borderColor: "#09090b" },
  radioLabel: { fontSize: 13 },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  disclosure: { flexDirection: "row", alignItems: "center", gap: 4 },
  disclosureLabel: { fontSize: 13, fontWeight: "500", color: "rgba(0,0,0,0.6)" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  footer: { flexDirection: "row", gap: 8, marginTop: 8 },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  submitButton: {
    flex: 1,
    height: 44,
    borderRadius: 6,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  error: {
    fontSize: 13,
    color: "#b91c1c",
    backgroundColor: "#fef2f2",
    borderRadius: 6,
    padding: 10,
  },
  currencyList: { padding: 16 },
  currencyRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  currencyText: { fontSize: 15 },
  currencyTextOn: { fontWeight: "700" },
});
