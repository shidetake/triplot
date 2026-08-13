import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocale, useTranslations } from "use-intl";

import { type Airline, searchAirlines } from "@triplot/shared/airlines";
import { createFlightApi } from "@triplot/shared/data/flightApi";
import {
  durationMinutes,
  type Flight,
  isComplete,
  looksLikeAirlineQuery,
  parseFlightNumber,
} from "@triplot/shared/flight";
import {
  FLIGHT_SEARCH_DEBOUNCE_MS,
  lookupFlight,
  peekCachedFlight,
} from "@triplot/shared/flightLookup";
import { loadAirportNames, localizeFlightJa } from "@triplot/shared/flightLocalize";

import { XIcon } from "./icons";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// フライト番号の入力。予定フォームのタイトル欄と**入れ替わる**（行を増やさない）。
//
// 1つの欄に何を打ってもよく、打った内容で分岐する（Flighty と同じ）。
// モードを分けると「航空会社から探す」「番号を打つ」のどちらかを最初に選ぶ圧が
// 生まれる。英数字なら便名として直行、文字だけなら航空会社の候補を出し、選ぶと
// コードがチップに畳まれて数字だけの入力に進む。
//
// 日付はフォームの日時をそのまま使う（Flighty のように別途聞かない）。予定
// フォームには既に日時欄があり、聞くと二度手間になる。

export function FlightPicker({
  date,
  initialNumber,
  onCancel,
  onApply,
}: {
  /** 検索に使う出発日 "YYYY-MM-DD"（フォームの日時から渡る） */
  date: string;
  /** 打った状態から始める便名（メール取り込み下書きの確定など、便名が既に
      分かっている時に自動で検索まで走らせる。手打ちと同じ経路を通るだけ）。 */
  initialNumber?: string;
  onCancel: () => void;
  onApply: (flight: Flight) => void;
}) {
  const t = useTranslations("event");
  const tc = useTranslations("common");
  const locale = useLocale();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  // 航空会社を選んで確定したコード。null なら1つの欄に何でも打てる状態。
  const [airline, setAirline] = useState<Airline | null>(null);
  const [text, setText] = useState(initialNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Flight | null>(null);
  // 直近で解決済み（検索中の状態を抜けた）の "便名|日付" キー。busy を専用の
  // state にせず、これと今のキーの一致/不一致から導出する（effect 内で直接
  // setState すると react-hooks/set-state-in-effect に触れるため、派生値にする）。
  const [settledKey, setSettledKey] = useState<string | null>(null);

  // 打っている途中の古い応答が後から届いて上書きするのを防ぐ。
  const seq = useRef(0);
  // Enter/確定で debounce を待たず今すぐ引くための差し替え口（effect が
  // 都度差し替える。対象が崩れている間は no-op）。
  const runNowRef = useRef<() => void>(() => {});

  const typed = airline ? `${airline.iata}${text.trim()}` : text.trim();
  const parsed = parseFlightNumber(typed);
  const suggestions =
    airline === null && looksLikeAirlineQuery(text) ? searchAirlines(text, 6) : [];
  const normalized = parsed?.normalized ?? null;
  const key = normalized !== null ? `${normalized}|${date}` : null;

  // 便名が揃ったら自動で引く（送信ボタンを押させない。Flighty と同じ）。
  // 「検索中」は揃った時点ですぐ出すが（showBusy の導出を参照）、実際に提供元を
  // 叩くのは入力が止まってから（1文字ごとに叩くとレートリミットに引っかかる）。
  // ただし全ユーザー横断のキャッシュだけは待たずに覗き、当たれば即表示する
  // （キャッシュ照会は自前 DB を見るだけで提供元の枠を消費しないので安全）。
  useEffect(() => {
    if (normalized === null) {
      runNowRef.current = () => {};
      return;
    }
    const currentKey = `${normalized}|${date}`;
    const my = ++seq.current;
    let fired = false;

    const applyFound = async (flight: Flight) => {
      // 提供元は英語名しか返さないので日本語に差し替える（対訳表は動的 import）。
      let localized = flight;
      try {
        const table = await loadAirportNames(locale);
        if (table) localized = localizeFlightJa(flight, table);
      } catch {
        // 日本語化に失敗しても便自体は出す。
      }
      if (my !== seq.current) return;
      setResult(localized);
      setError(null);
      setSettledKey(currentKey);
    };

    const runLookup = () => {
      if (fired) return;
      fired = true;
      clearTimeout(timer);
      void (async () => {
        try {
          const outcome = await lookupFlight(createFlightApi(supabase), normalized, date);
          if (my !== seq.current) return;
          if (outcome.kind === "found") {
            await applyFound(outcome.flight);
          } else {
            setResult(null);
            setError(
              outcome.kind === "unknown-number" ? t("flightNotFound") : t("flightNoData"),
            );
            setSettledKey(currentKey);
          }
        } catch {
          if (my !== seq.current) return;
          setResult(null);
          setError(t("flightFailed"));
          setSettledKey(currentKey);
        }
      })();
    };
    runNowRef.current = runLookup;

    void peekCachedFlight(createFlightApi(supabase), normalized, date).then((flight) => {
      if (fired || my !== seq.current || !flight) return;
      fired = true;
      clearTimeout(timer);
      void applyFound(flight);
    });

    const timer = setTimeout(runLookup, FLIGHT_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // date が変わったら引き直す（フォームの日時を変えた場合）
  }, [normalized, date]); // eslint-disable-line react-hooks/exhaustive-deps

  // 便名が崩れている間（消しかけ等）は前の結果を出さない。effect で state を
  // 消しに行かず、表示側で門番する。
  const showBusy = key !== null && settledKey !== key;
  const showError = key !== null && settledKey === key ? error : null;
  const showResult =
    normalized !== null && result?.number === normalized ? result : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {airline && (
          <Pressable
            onPress={() => {
              setAirline(null);
              setText("");
            }}
            style={styles.chip}
            accessibilityLabel={airline.name}
          >
            <Text style={styles.chipText}>{airline.iata}</Text>
          </Pressable>
        )}
        <View style={styles.inputWrap}>
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType={airline ? "number-pad" : "default"}
            onSubmitEditing={() => runNowRef.current()}
            placeholder={
              airline ? t("flightNumberPlaceholder") : t("flightPlaceholder")
            }
            accessibilityLabel={t("flightAria")}
            placeholderTextColor={theme.subtleForeground}
            style={[styles.input, styles.inputPadded]}
          />
          <Pressable
            onPress={onCancel}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            style={styles.close}
            accessibilityLabel={tc("cancel")}
          >
            <XIcon size={16} color={theme.mutedForeground} />
          </Pressable>
        </View>
      </View>

      {suggestions.length > 0 && (
        <View style={styles.list}>
          {suggestions.map((a) => (
            <Pressable
              key={a.iata}
              onPress={() => {
                setAirline(a);
                setText("");
              }}
              style={styles.listRow}
            >
              <Text style={styles.listName}>{a.name}</Text>
              <Text style={styles.listSub}>
                {a.icao ? `${a.iata}・${a.icao}` : a.iata}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {showBusy && <Text style={styles.hint}>{t("flightSearching")}</Text>}
      {showError !== null && <Text style={styles.error}>{showError}</Text>}

      {showResult && (
        <FlightPreview flight={showResult} onApply={() => onApply(showResult)} />
      )}
    </View>
  );
}

/**
 * 確定前のプレビュー。**自動では適用しない。**
 * 便名の打ち間違いに気付ける最後の場所であり、予測値かどうかもここで示す。
 */
function FlightPreview({ flight, onApply }: { flight: Flight; onApply: () => void }) {
  const t = useTranslations("event");
  const styles = useThemedStyles(makeStyles);
  const dur = durationMinutes(flight);
  const estimated = flight.source.kind === "estimated";

  return (
    <Pressable onPress={onApply} style={styles.card} accessibilityLabel={t("flightApply")}>
      <View style={styles.cardHead}>
        <Text style={styles.cardNumber}>{flight.number}</Text>
        <Text style={styles.cardAirline} numberOfLines={1}>
          {flight.airlineName}
        </Text>
        {dur !== null && (
          <Text style={styles.cardDuration}>
            {t("flightHours", { h: Math.floor(dur / 60), m: dur % 60 })}
          </Text>
        )}
      </View>

      <View style={styles.cardRoute}>
        <Endpoint
          code={flight.departure.iata ?? flight.departure.name}
          city={flight.departure.municipality}
          time={flight.departure.scheduledLocal}
        />
        <Text style={styles.arrow}>→</Text>
        <Endpoint
          code={flight.arrival.iata ?? flight.arrival.name}
          city={flight.arrival.municipality}
          time={flight.arrival.scheduledLocal}
        />
      </View>

      {estimated && flight.source.kind === "estimated" && (
        <Text style={styles.estimate}>
          {t("flightEstimatedFrom", { date: flight.source.basedOn })}
        </Text>
      )}
      {!isComplete(flight) && (
        <Text style={styles.estimate}>{t("flightMissingTimes")}</Text>
      )}
    </Pressable>
  );
}

function Endpoint({
  code,
  city,
  time,
}: {
  code: string;
  city: string | null;
  time: string | null;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.endpoint}>
      <Text style={styles.endpointCode} numberOfLines={1}>
        {code}
      </Text>
      <Text style={styles.endpointTime}>{time ? time.slice(11, 16) : "--:--"}</Text>
      {city && (
        <Text style={styles.endpointCity} numberOfLines={1}>
          {city}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    // × ボタンは入力欄の内側右端に重ねる（タイトル行の飛行機アイコンと同じ形）。
    inputWrap: { flex: 1, minWidth: 0, position: "relative" },
    input: {
      height: 36,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 10,
      fontSize: 14,
      color: t.foreground,
    },
    inputPadded: { paddingRight: 40 },
    // 確定した航空会社コード。入力欄と同じ高さで、畳まれた入力に見せる。
    chip: {
      height: 36,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: t.fgAlpha(0.06),
      alignItems: "center",
      justifyContent: "center",
    },
    chipText: { fontSize: 14, fontWeight: "500", color: t.foreground },
    close: {
      position: "absolute",
      right: 4,
      top: 4,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    list: {
      borderWidth: 1,
      borderColor: t.fgAlpha(0.1),
      borderRadius: 6,
      maxHeight: 256,
      overflow: "hidden",
    },
    listRow: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    listName: { flex: 1, fontSize: 14, color: t.foreground },
    listSub: { fontSize: 12, color: t.mutedForeground },
    hint: { fontSize: 12, color: t.mutedForeground },
    error: {
      fontSize: 13,
      color: t.errorText,
      backgroundColor: t.errorBg,
      borderRadius: 6,
      padding: 10,
    },
    card: {
      borderWidth: 1,
      borderColor: t.fgAlpha(0.1),
      borderRadius: 8,
      padding: 12,
      gap: 8,
    },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
    cardNumber: { fontSize: 14, fontWeight: "600", color: t.foreground },
    cardAirline: { flex: 1, minWidth: 0, fontSize: 12, color: t.mutedForeground },
    cardDuration: { fontSize: 12, color: t.mutedForeground, fontVariant: ["tabular-nums"] },
    cardRoute: { flexDirection: "row", alignItems: "center", gap: 12 },
    endpoint: { flex: 1, minWidth: 0 },
    endpointCode: { fontSize: 14, fontWeight: "500", color: t.foreground },
    endpointTime: {
      fontSize: 18,
      fontWeight: "600",
      color: t.foreground,
      fontVariant: ["tabular-nums"],
    },
    endpointCity: { fontSize: 12, color: t.mutedForeground },
    arrow: { fontSize: 16, color: t.subtleForeground },
    estimate: { fontSize: 12, color: t.mutedForeground },
  });
