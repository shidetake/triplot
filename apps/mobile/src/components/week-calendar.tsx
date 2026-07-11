import { useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import {
  eventBarHueBg,
  eventBarHueText,
  eventBlockHueBg,
  eventBlockHueBorder,
  eventBlockHueText,
  GREEN_HUE,
  pickEventColor,
} from "@triplot/shared/eventColor";
import { formatMinutes, type Schedule } from "@triplot/shared/schedule";
import type { EventRow } from "@triplot/shared/tripDerive";

import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// 週カレンダーの描画（RN）。レイアウト計算は shared の buildSchedule に委ね、
// ここはその出力（列・配置済みブロック・終日バー）を描くだけ（web の
// week-calendar.tsx と同じ役割分担）。寸法も web に合わせる。

const GUTTER = 44; // 時刻ガター幅
const HOUR_PX = 30; // 1時間の高さ
const ALLDAY_ROW = 24; // 終日バー1行の高さ
const HEADER_H = 34; // 日付ヘッダの高さ
const MIN_BLOCK = 18; // ブロック最低高さ

function colWidth(n: number): number {
  if (n <= 3) return 120;
  if (n <= 6) return 96;
  return 80;
}

const hhmm = (min: number) => formatMinutes(min, false);

export function WeekCalendar({
  schedule,
  events,
  memberHueById,
  activeMemberCount,
  myMemberId,
  onEventPress,
}: {
  schedule: Schedule;
  // 色決定に元イベント（参加者・visibility）が要るので id 引きできるよう渡す。
  events: EventRow[];
  memberHueById: Map<string, number | null>;
  activeMemberCount: number;
  myMemberId: string;
  onEventPress: (event: EventRow) => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { groups, columns, timed, transits, allDayBars, allDayRowCount } =
    schedule;

  // 2軸スクロール: 縦（時間）は外側 VerticalScrollView、横（日列）はヘッダと
  // 本体の2つの HorizontalScrollView を onScroll で同期させる（ガターは固定）。
  const headerScroll = useRef<ScrollView>(null);
  const bodyScroll = useRef<ScrollView>(null);

  const COL = colWidth(columns.length);
  const totalW = columns.length * COL;
  const bodyH = 24 * HOUR_PX;
  const colIndexByKey = new Map(columns.map((c, i) => [c.key, i]));
  const eventById = new Map(events.map((e) => [e.id, e]));

  const y = (min: number) => (Math.min(Math.max(min, 0), 1440) / 60) * HOUR_PX;

  const syncFromBody = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    headerScroll.current?.scrollTo({
      x: e.nativeEvent.contentOffset.x,
      animated: false,
    });
  };
  const syncFromHeader = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    bodyScroll.current?.scrollTo({
      x: e.nativeEvent.contentOffset.x,
      animated: false,
    });
  };

  // 取り込み下書き（未確定）の見た目。まだ実データが無く参加者/公開範囲が
  // 未定なので、参加者構成に基づく色分けより優先して warning(amber)＋破線で
  // 「未確定」を示す（web の draftAppearance と同じ。ui-guidelines のセマンティック色）。
  const DRAFT_COLORS = {
    bg: t.warnBg,
    border: t.dark ? "rgba(251,191,36,0.5)" : "#fbbf24", // amber-400（darkは/50）
    text: t.warnText,
    dim: false,
  };

  // 予定ブロックの色（web の pickEventColor + hsl ヘルパーと同じ）。
  const blockColors = (ev: EventRow) => {
    if (ev.isDraft) return DRAFT_COLORS;
    const c = pickEventColor({
      visibility: ev.visibility,
      participantMemberIds: ev.participantMemberIds,
      activeMemberCount,
      memberHueById,
      myMemberId,
    });
    let hue: number | null = null;
    if (c.kind === "green") hue = GREEN_HUE;
    else if (c.kind === "hue") hue = c.hue;
    else if (c.kind === "mixed") hue = c.selfHue;
    if (hue == null) {
      // private / 自分不参加の mixed = 中立グレー。
      return {
        bg: t.fgAlpha(0.06),
        border: t.fgAlpha(0.15),
        text: t.mutedForeground,
        dim: c.kind === "mixed",
      };
    }
    return {
      bg: eventBlockHueBg(hue, false),
      border: eventBlockHueBorder(hue),
      text: eventBlockHueText(hue),
      dim: false,
    };
  };
  const barColors = (ev: EventRow) => {
    if (ev.isDraft) return { bg: DRAFT_COLORS.bg, text: DRAFT_COLORS.text };
    const c = pickEventColor({
      visibility: ev.visibility,
      participantMemberIds: ev.participantMemberIds,
      activeMemberCount,
      memberHueById,
      myMemberId,
    });
    let hue: number | null = null;
    if (c.kind === "green") hue = GREEN_HUE;
    else if (c.kind === "hue") hue = c.hue;
    else if (c.kind === "mixed") hue = c.selfHue;
    if (hue == null)
      return { bg: t.fgAlpha(0.08), text: t.mutedForeground };
    return { bg: eventBarHueBg(hue, false), text: eventBarHueText(hue) };
  };

  return (
    <View style={styles.container}>
      {/* ── ヘッダ（日付 + 終日バー）。横スクロールは本体と同期 ── */}
      <View style={styles.headerRow}>
        <View style={[styles.corner, { width: GUTTER }]} />
        <ScrollView
          ref={headerScroll}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          onScroll={syncFromHeader}
          scrollEventThrottle={16}
        >
          <View style={{ width: totalW }}>
            {/* 日付ヘッダ行 */}
            <View style={[styles.dayHeaderRow, { height: HEADER_H }]}>
              {groups.map((g) => {
                const w = g.columns.length * COL;
                return (
                  <View
                    key={g.key}
                    style={[styles.dayHeaderCell, { width: w }]}
                  >
                    <Text style={styles.dayHeaderLabel} numberOfLines={1}>
                      {g.label}
                    </Text>
                    {g.tzNote ? (
                      <Text style={styles.tzNote} numberOfLines={1}>
                        {g.tzNote}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
            {/* 終日バー行 */}
            {allDayRowCount > 0 && (
              <View
                style={[
                  styles.allDayArea,
                  { height: allDayRowCount * ALLDAY_ROW },
                ]}
              >
                {allDayBars.map((b) => {
                  const ev = eventById.get(b.event.id);
                  if (!ev) return null;
                  const col = barColors(ev);
                  const left = b.startColIndex * COL;
                  const width = (b.endColIndex - b.startColIndex + 1) * COL;
                  return (
                    <Pressable
                      key={b.event.id + b.row}
                      onPress={() => onEventPress(ev)}
                      style={[
                        styles.allDayBar,
                        ev.isDraft && styles.draftBar,
                        {
                          left: left + 2,
                          width: width - 4,
                          top: b.row * ALLDAY_ROW + 1,
                          backgroundColor: col.bg,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.allDayText, { color: col.text }]}
                        numberOfLines={1}
                      >
                        {b.event.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* ── 本体（時間グリッド）。縦スクロール ── */}
      <ScrollView
        style={styles.body}
        contentOffset={{ x: 0, y: 6 * HOUR_PX }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bodyRow}>
          {/* 時刻ガター（固定・縦だけスクロール） */}
          <View style={{ width: GUTTER, height: bodyH }}>
            {Array.from({ length: 24 }, (_, h) => (
              <View
                key={h}
                style={[styles.gutterHour, { top: h * HOUR_PX }]}
              >
                <Text style={styles.gutterLabel}>{h}:00</Text>
              </View>
            ))}
          </View>

          {/* 日列（横スクロール） */}
          <ScrollView
            ref={bodyScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={syncFromBody}
            scrollEventThrottle={16}
          >
            <View style={{ width: totalW, height: bodyH }}>
              {/* 時間グリッド線 */}
              {Array.from({ length: 25 }, (_, h) => (
                <View
                  key={h}
                  style={[styles.hourLine, { top: h * HOUR_PX, width: totalW }]}
                />
              ))}
              {/* 列の縦罫線 */}
              {columns.map((c, i) => (
                <View
                  key={c.key}
                  style={[styles.colLine, { left: i * COL, height: bodyH }]}
                />
              ))}

              {/* 時刻イベント */}
              {timed.map((p) => {
                const ev = eventById.get(p.event.id);
                if (!ev) return null;
                const ci = colIndexByKey.get(p.columnKey);
                if (ci == null) return null;
                const col = blockColors(ev);
                const top = y(p.topMin);
                const height = Math.max(
                  MIN_BLOCK,
                  y(p.endMin) - y(p.topMin),
                );
                const laneW = COL / p.laneCount;
                return (
                  <Pressable
                    key={p.event.id + p.columnKey}
                    onPress={() => onEventPress(ev)}
                    style={[
                      styles.eventBlock,
                      ev.isDraft && styles.draftBlock,
                      {
                        left: ci * COL + p.lane * laneW + 1,
                        width: laneW - 2,
                        top,
                        height: height - 1,
                        backgroundColor: col.bg,
                        borderColor: col.border,
                        opacity: col.dim ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.eventTitle, { color: col.text }]}
                      numberOfLines={2}
                    >
                      {p.event.title}
                    </Text>
                    {height > 34 && (
                      <Text
                        style={[styles.eventTime, { color: col.text }]}
                        numberOfLines={1}
                      >
                        {hhmm(p.topMin)}
                      </Text>
                    )}
                  </Pressable>
                );
              })}

              {/* 時差移動（出発側・到着側の2ブロック） */}
              {transits.map((t) => {
                const ev = eventById.get(t.event.id);
                if (!ev) return null;
                const col = blockColors(ev);
                const parts: {
                  key: string;
                  ci: number;
                  top: number;
                  height: number;
                  lane: number;
                  laneCount: number;
                  label: string;
                }[] = [];
                const depCi = colIndexByKey.get(t.departColumnKey);
                const arrCi = colIndexByKey.get(t.arriveColumnKey);
                if (depCi != null) {
                  const endMin =
                    t.departColumnKey === t.arriveColumnKey
                      ? t.arriveMin
                      : 1440;
                  parts.push({
                    key: "dep",
                    ci: depCi,
                    top: y(t.departMin),
                    height: Math.max(MIN_BLOCK, y(endMin) - y(t.departMin)),
                    lane: t.departLane,
                    laneCount: t.departLaneCount,
                    label: `${t.event.title} 発`,
                  });
                }
                if (arrCi != null && t.arriveColumnKey !== t.departColumnKey) {
                  parts.push({
                    key: "arr",
                    ci: arrCi,
                    top: 0,
                    height: Math.max(MIN_BLOCK, y(t.arriveMin)),
                    lane: t.arriveLane,
                    laneCount: t.arriveLaneCount,
                    label: `${t.event.title} 着`,
                  });
                }
                return parts.map((part) => {
                  const laneW = COL / part.laneCount;
                  return (
                    <Pressable
                      key={t.event.id + part.key}
                      onPress={() => onEventPress(ev)}
                      style={[
                        styles.eventBlock,
                        styles.transitBlock,
                        {
                          left: part.ci * COL + part.lane * laneW + 1,
                          width: laneW - 2,
                          top: part.top,
                          height: part.height - 1,
                          backgroundColor: col.bg,
                          borderColor: col.border,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.eventTitle, { color: col.text }]}
                        numberOfLines={2}
                      >
                        {part.label}
                      </Text>
                    </Pressable>
                  );
                });
              })}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.fgAlpha(0.12),
  },
  corner: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.fgAlpha(0.08),
  },
  dayHeaderRow: { flexDirection: "row" },
  dayHeaderCell: {
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.fgAlpha(0.08),
    paddingHorizontal: 2,
  },
  dayHeaderLabel: { fontSize: 12, fontWeight: "600", color: t.foreground },
  tzNote: { fontSize: 9, color: t.mutedForeground },
  allDayArea: {
    backgroundColor: t.fgAlpha(0.02),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.fgAlpha(0.06),
  },
  allDayBar: {
    position: "absolute",
    height: ALLDAY_ROW - 2,
    borderRadius: 4,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  allDayText: { fontSize: 10, fontWeight: "500" },
  body: { flex: 1 },
  bodyRow: { flexDirection: "row" },
  gutterHour: { position: "absolute", right: 4 },
  gutterLabel: {
    fontSize: 10,
    color: t.subtleForeground,
    transform: [{ translateY: -6 }],
  },
  hourLine: {
    position: "absolute",
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.fgAlpha(0.06),
  },
  colLine: {
    position: "absolute",
    width: StyleSheet.hairlineWidth,
    backgroundColor: t.fgAlpha(0.06),
  },
  eventBlock: {
    position: "absolute",
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 3,
    paddingVertical: 1,
    overflow: "hidden",
  },
  transitBlock: { borderStyle: "dashed" },
  // 取り込み下書きの疑似ブロック（amber 破線）。timed でも破線にする。
  draftBlock: { borderStyle: "dashed" },
  // 終日バーは通常枠なし → 下書きだけ amber 破線の枠を足す（web と同じ）。
  draftBar: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: t.dark ? "rgba(251,191,36,0.5)" : "#fbbf24", // amber-400
  },
  eventTitle: { fontSize: 11, fontWeight: "500" },
  eventTime: { fontSize: 9, opacity: 0.7 },
});
