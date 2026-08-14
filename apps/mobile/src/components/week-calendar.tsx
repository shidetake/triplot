import { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTranslations } from "use-intl";

import {
  eventHueBg,
  eventHueText,
  GREEN_HUE,
  pickEventColor,
} from "@triplot/shared/eventColor";
import {
  computeGhostLaneOverrides,
  GHOST_LANE_KEY,
} from "@triplot/shared/ghostLanes";
import {
  formatMinutes,
  parseWall,
  type Schedule,
} from "@triplot/shared/schedule";
import type { EventRow } from "@triplot/shared/tripDerive";

import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

const ticketMarkSource = require("../../assets/marks/reservation-ticket.png");
const checkMarkSource = require("../../assets/marks/reservation-check.png");

// 週カレンダーの描画（RN）。レイアウト計算は shared の buildSchedule に委ね、
// ここはその出力（列・配置済みブロック・終日バー）を描くだけ（web の
// week-calendar.tsx と同じ役割分担）。寸法も web に合わせる。

const GUTTER = 44; // 時刻ガター幅
const HOUR_PX = 30; // 1時間の高さ
const ALLDAY_ROW = 24; // 終日バー1行の高さ
const HEADER_H = 34; // 日付ヘッダの高さ（TZ注記あり）
const HEADER_H_COMPACT = 22; // 日付ヘッダの高さ（TZ注記なし＝日付ラベルのみ）
const MIN_BLOCK = 18; // ブロック最低高さ

// 5日以上表示するときの1日の最小幅。iPhone 16 Pro（幅393pt）でガター(44px)を
// 引いた残りに約4.5日分入る値（(393-44)/80 ≈ 4.4日）。狭い端末（iPhone mini
// 等）で窮屈すぎるかは実機確認が要るが、まずはこの px 値で固定する。
const MIN_COL = 80;

// 表示日数が4日以下なら余白なく画面幅いっぱいに均等割り、5日以上なら
// MIN_COL で横スクロールさせる（web と違い日数固定表示が主用途のため）。
function colWidth(n: number, availableWidth: number): number {
  if (n <= 4) return availableWidth / n;
  return MIN_COL;
}

const hhmm = (min: number) => formatMinutes(min, false);

// 複数日にまたがる予定は日ごとに複数ブロックへ分割されるが、ブロックごとの
// topMin/endMin（その日の中で見える範囲だけ）をそのまま出すとブロックごとに
// 違う時刻が出て統一感がない。日をまたぐ予定だけ、どのブロックにも同じ
// 「開始 - 終了」（元の startAt/endAt）を出す。単日の予定は今まで通り。
function spanLabel(ev: { startAt: string; endAt: string | null }): string | null {
  if (!ev.endAt) return null;
  const s = parseWall(ev.startAt);
  const e = parseWall(ev.endAt);
  if (e.date === s.date) return null;
  return `${hhmm(s.minutes)} - ${hhmm(e.minutes)}`;
}

// 予約マーカー（タイトル先頭。web の ReservationMark と同じ意味）:
// 要予約（未）= チケット黄 / 予約済 = 淡色チェック。ブロック地色はそのまま。
//
// タイトルの <Text> の**子として**返す（sibling の row に置かない）。RN の
// Text は Image を子に持てて自然にインライン折り返しできるので、web の
// inline-block アイコンと同じく2行目以降が字下げされずに折り返せる
// （row 並びだと SVG を子にできず、折り返しのたび2行目以降もアイコン分だけ
// 幅が狭まって不自然に字下げされる不具合があった）。色が固定のチケットは
// PNG 自体は黒シルエットで焼いてあり、どちらも tintColor で塗り替える
// （チケットは固定の黄、チェックはブロックごとに変わる textColor）。
const TICKET_COLOR = "#facc15"; // web の text-yellow-400 と同値
function ReservationMark({
  ev,
  textColor,
}: {
  ev: EventRow;
  textColor: string;
}) {
  if (!ev.needsReservation) return null;
  return ev.reservationDone ? (
    <Image
      source={checkMarkSource}
      style={[reservationMarkStyle, { tintColor: textColor }]}
    />
  ) : (
    <Image
      source={ticketMarkSource}
      style={[reservationMarkStyle, { tintColor: TICKET_COLOR }]}
    />
  );
}

const reservationMarkStyle = { width: 12, height: 12, marginRight: 2 };

export function WeekCalendar({
  schedule,
  events,
  memberHueById,
  activeMemberCount,
  myMemberId,
  placeName,
  onEventPress,
  onSlotPick,
}: {
  schedule: Schedule;
  // 色決定に元イベント（参加者・visibility）が要るので id 引きできるよう渡す。
  events: EventRow[];
  memberHueById: Map<string, number | null>;
  activeMemberCount: number;
  myMemberId: string;
  // ブロックに場所名を出す解決関数（web の week-calendar と同じ契約）。
  placeName: (placeId: string | null) => string | null;
  onEventPress: (event: EventRow) => void;
  // 空き枠の長押し→ゴースト→ドラッグ→離した位置で確定（web と同じ）。
  // date は確定した列の日付、minutes は 0時からの通算分（30分スナップ済み）。
  onSlotPick: (date: string, minutes: number) => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tSched = useTranslations("schedule");
  const { groups, columns, timed, transits, allDayBars, allDayRowCount } =
    schedule;

  // 2軸スクロール: 縦（時間）は外側 VerticalScrollView、横（日列）はヘッダと
  // 本体の2つの HorizontalScrollView を onScroll で同期させる（ガターは固定）。
  const headerScroll = useRef<ScrollView>(null);
  const bodyScroll = useRef<ScrollView>(null);
  const verticalScroll = useRef<ScrollView>(null);

  // 画面回転等で幅が変わるので state で持ち、onLayout で更新する。初回描画は
  // Dimensions で概算し、実測後に差し替える。
  const [containerWidth, setContainerWidth] = useState(
    () => Dimensions.get("window").width,
  );
  const COL = colWidth(columns.length, containerWidth - GUTTER);
  const totalW = columns.length * COL;
  const bodyH = 24 * HOUR_PX;
  // TZ注記が無い週は、注記ぶんの高さを空けておく必要が無いので薄くする
  // （前進する便の注記があるときだけ広げる。日付ラベルだけの週は詰める）。
  const headerH = groups.some((g) => g.tzNote) ? HEADER_H : HEADER_H_COMPACT;
  const colIndexByKey = new Map(columns.map((c, i) => [c.key, i]));
  const eventById = new Map(events.map((e) => [e.id, e]));

  const y = (min: number) => (Math.min(Math.max(min, 0), 1440) / 60) * HOUR_PX;

  // 現在のスクロール量（auto-scroll と指位置→グリッド座標の変換に使う）。
  const scrollXRef = useRef(0);
  const scrollYRef = useRef(6 * HOUR_PX); // contentOffset 初期値と同じ

  // 同期は本体→ヘッダの一方向のみ。ヘッダは scrollEnabled=false で自発的に
  // 動かないので逆方向の同期は不要（以前はヘッダの onScroll から本体へ
  // scrollTo を返していて、右端バウンス中に「本体→ヘッダ→本体…」の発振＝
  // バウンドを無限に繰り返す状態になることがあった）。
  const syncFromBody = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollXRef.current = e.nativeEvent.contentOffset.x;
    headerScroll.current?.scrollTo({
      x: e.nativeEvent.contentOffset.x,
      animated: false,
    });
  };

  // ── 空き枠の長押し→ゴースト→ドラッグ→離して確定（web と同じ UX） ──
  // 長押し成立でゴースト（1時間・半透明）を置き、縦ドラッグ＝時刻・
  // 横ドラッグ＝日付で動かし、離した位置の日時でフォームを開く。
  // ゴースト中は2軸のスクロールを止め、画面端では auto-scroll で
  // 見えていない時刻・日付へ持っていける。
  type GhostState = { columnIndex: number; startMin: number };
  const [ghost, setGhostState] = useState<GhostState | null>(null);
  const ghostRef = useRef<GhostState | null>(null);
  const setGhost = useCallback((g: GhostState | null) => {
    ghostRef.current = g;
    setGhostState(g);
  }, []);
  // 縦スクロール領域（ガター含む）の画面上の枠。ゴースト開始時に実測。
  const bodyWrap = useRef<View>(null);
  const viewportRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  // 指の絶対座標（auto-scroll の端判定と、scroll 中のゴースト追従に使う）。
  const dragAbsRef = useRef<{ x: number; y: number } | null>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // グリッド内容座標 → ゴースト位置。web と同じく指の30分上を開始時刻に
  // （指で隠れず見やすい）、30分スナップ。
  const ghostAt = useCallback(
    (contentX: number, contentY: number): GhostState => {
      const raw = (contentY / HOUR_PX) * 60;
      const snapped = Math.max(0, Math.min(1380, Math.round(raw / 30) * 30));
      return {
        columnIndex: Math.max(
          0,
          Math.min(columns.length - 1, Math.floor(contentX / COL)),
        ),
        startMin: Math.max(0, snapped - 30),
      };
    },
    [columns.length, COL],
  );

  const stopAutoScroll = useCallback(() => {
    if (autoTimer.current) {
      clearInterval(autoTimer.current);
      autoTimer.current = null;
    }
  }, []);

  // 画面端にいる間 16ms ごとにスクロールし、ゴーストを指の下に追従させる。
  const updateAutoScroll = useCallback(() => {
    const EDGE = 40;
    const SPEED = 8;
    const tick = () => {
      const vp = viewportRef.current;
      const pos = dragAbsRef.current;
      if (!vp || !pos) {
        stopAutoScroll();
        return;
      }
      let vy = 0;
      let vx = 0;
      if (pos.y < vp.y + EDGE) vy = -SPEED;
      else if (pos.y > vp.y + vp.h - EDGE) vy = SPEED;
      // 左端は時刻ガターが居座るので、列が始まる位置を基準にする（web と同じ）。
      if (pos.x < vp.x + GUTTER + EDGE) vx = -SPEED;
      else if (pos.x > vp.x + vp.w - EDGE) vx = SPEED;
      if (vx === 0 && vy === 0) {
        stopAutoScroll();
        return;
      }
      scrollYRef.current = Math.max(
        0,
        Math.min(bodyH - vp.h, scrollYRef.current + vy),
      );
      scrollXRef.current = Math.max(
        0,
        Math.min(totalW - (vp.w - GUTTER), scrollXRef.current + vx),
      );
      verticalScroll.current?.scrollTo({
        y: scrollYRef.current,
        animated: false,
      });
      bodyScroll.current?.scrollTo({ x: scrollXRef.current, animated: false });
      // 指は動いていなくても内容が流れる＝指の絶対座標から内容座標を再計算。
      const g = ghostAt(
        pos.x - vp.x - GUTTER + scrollXRef.current,
        pos.y - vp.y + scrollYRef.current,
      );
      const cur = ghostRef.current;
      if (
        cur &&
        (g.columnIndex !== cur.columnIndex || g.startMin !== cur.startMin)
      ) {
        setGhost(g);
      }
    };
    if (!autoTimer.current) autoTimer.current = setInterval(tick, 16);
  }, [bodyH, totalW, ghostAt, setGhost, stopAutoScroll]);

  // pan のコールバック。ref を触るので useCallback に置く（render 中には
  // 走らない＝React Compiler の ref ルールに沿う）。
  type GhostTouch = { x: number; y: number; absoluteX: number; absoluteY: number };
  const onGhostStart = useCallback(
    (e: GhostTouch) => {
      bodyWrap.current?.measureInWindow((x, y2, w, h) => {
        viewportRef.current = { x, y: y2, w, h };
      });
      dragAbsRef.current = { x: e.absoluteX, y: e.absoluteY };
      setGhost(ghostAt(e.x, e.y));
    },
    [ghostAt, setGhost],
  );
  const onGhostUpdate = useCallback(
    (e: GhostTouch) => {
      dragAbsRef.current = { x: e.absoluteX, y: e.absoluteY };
      const g = ghostAt(e.x, e.y);
      const cur = ghostRef.current;
      if (
        !cur ||
        g.columnIndex !== cur.columnIndex ||
        g.startMin !== cur.startMin
      ) {
        setGhost(g);
      }
      updateAutoScroll();
    },
    [ghostAt, setGhost, updateAutoScroll],
  );
  const onGhostEnd = useCallback(() => {
    const g = ghostRef.current;
    const col = g ? columns[g.columnIndex] : null;
    if (g && col) onSlotPick(col.date, g.startMin);
  }, [columns, onSlotPick]);
  const onGhostFinalize = useCallback(() => {
    stopAutoScroll();
    dragAbsRef.current = null;
    setGhost(null);
  }, [setGhost, stopAutoScroll]);

  // 長押しで発動する pan。e.x/e.y はグリッド内容 View 基準＝そのまま内容座標。
  // react-hooks/refs は「ref を触る関数を未知の関数に渡した」ことを render 中
  // 実行の可能性ありと誤検知する。Gesture のビルダーはコールバックを保存する
  // だけで、実行はジェスチャーイベント時のみなので無効化してよい。
  /* eslint-disable react-hooks/refs */
  const ghostPan = Gesture.Pan()
    .maxPointers(1)
    .activateAfterLongPress(500)
    .runOnJS(true)
    .onStart(onGhostStart)
    .onUpdate(onGhostUpdate)
    .onEnd(onGhostEnd)
    .onFinalize(onGhostFinalize);
  /* eslint-enable react-hooks/refs */

  // ゴーストが既存予定と重なるときのレーン引き直し（shared・web と共用）。
  const ghostColKey = ghost ? columns[ghost.columnIndex]?.key : undefined;
  const laneOverrides = computeGhostLaneOverrides(
    ghost && ghostColKey
      ? {
          columnKey: ghostColKey,
          topMin: ghost.startMin,
          endMin: ghost.startMin + 60,
        }
      : null,
    timed,
    transits,
  );

  // 取り込み下書き（未確定）の見た目。まだ実データが無く参加者/公開範囲が
  // 未定なので、参加者構成に基づく色分けより優先して warning(amber)＋破線で
  // 「未確定」を示す（web の draftAppearance と同じ。ui-guidelines のセマンティック色）。
  const DRAFT_COLORS = {
    bg: t.warnBg,
    text: t.warnText,
    dim: false,
  };

  // 予定ブロックの色。終日バーも通常/移動ブロックも同じ枠線なし・濃いめの
  // 塗り（旧 barColors の式）に統一する（枠線あり/なしの2系統を分けていたが、
  // 分ける意味が無い＝実機で見比べて統一を決めた）。
  const eventColors = (ev: EventRow) => {
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
        bg: t.fgAlpha(0.08),
        text: t.mutedForeground,
        dim: c.kind === "mixed",
      };
    }
    return {
      bg: eventHueBg(hue, false),
      text: eventHueText(hue),
      dim: false,
    };
  };

  // 取り込み下書き（未確定）だけに付ける小バッジ。色のヒントだけでは
  // 分かりにくいという実機フィードバックを受けて追加（web の draftBadge
  // と同じ役割）。時刻とタイトルの間に**独立した行**として置く版
  // （時刻テキストと同じ numberOfLines={1} に同居させると、狭い列で
  // 「時刻+チップ」が収まらず未確定の文字が切れる実機フィードバックが
  // あったため、時刻の Text から追い出し、Pressable の直下に単独の
  // block として置く。alignSelf: flex-start で幅いっぱいに伸びるのを防ぐ）と、
  // 終日バーのようにタイトルの直前・同じ行に置く版（末尾にスペースを含む。
  // 入れ子 Text の margin は効かないため文字としてのスペースで区切る）の2つ。
  const draftBadge = (ev: EventRow) =>
    ev.isDraft ? (
      <Text style={[styles.draftBadge, styles.draftBadgeOwnLine]}>
        {tSched("draftBadge")}
      </Text>
    ) : null;
  const draftBadgeLead = (ev: EventRow) =>
    ev.isDraft ? (
      <Text style={styles.draftBadge}>{tSched("draftBadge")} </Text>
    ) : null;

  return (
    <View
      style={styles.container}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/* ── ヘッダ（日付 + 終日バー）。横スクロールは本体と同期 ── */}
      <View style={styles.headerRow}>
        <View style={[styles.corner, { width: GUTTER }]} />
        <ScrollView
          ref={headerScroll}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
        >
          <View style={{ width: totalW }}>
            {/* 日付ヘッダ行 */}
            <View style={[styles.dayHeaderRow, { height: headerH }]}>
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
                      // 前進する便（日付を結合しない）は注記だけ出発日＋到着日の
                      // 2列ぶんの幅で見せる（web と同じ。列自体は結合しない）。
                      // dayHeaderCell の alignItems:center を上書きして左端
                      // （＝この列の開始位置）に固定しないと、幅を広げた分が
                      // 左右均等にはみ出して前の日にも食い込んでしまう。
                      <Text
                        style={[
                          styles.tzNote,
                          {
                            alignSelf: "flex-start",
                            width: (g.tzNoteSpan ?? g.columns.length) * COL - 4,
                          },
                        ]}
                        numberOfLines={2}
                      >
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
                  const col = eventColors(ev);
                  const left = b.startColIndex * COL;
                  const width = (b.endColIndex - b.startColIndex + 1) * COL;
                  // 終日バーは複数列にまたがると横幅に余裕があるので、タイトルの
                  // 続きとして場所・メモを半角スペース区切りで同じ行に足す（改行
                  // はしない＝バーの高さは変えない）。1行に収まらない分は
                  // numberOfLines={1} の省略記号に任せる。
                  const extra = [placeName(ev.startPlaceId), ev.note]
                    .filter(Boolean)
                    .join(" ");
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
                          opacity: col.dim ? 0.5 : 1,
                        },
                      ]}
                    >
                      <View style={styles.titleRow}>
                        <ReservationMark ev={ev} textColor={col.text} />
                        <Text
                          style={[styles.allDayText, { color: col.text }]}
                          numberOfLines={1}
                        >
                          {draftBadgeLead(ev)}
                          {b.event.title}
                          {extra ? (
                            <Text style={styles.allDayExtra}> {extra}</Text>
                          ) : null}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* ── 本体（時間グリッド）。縦スクロール。ゴースト中は2軸とも
          スクロールを止めてドラッグに専念させる（web の scroll lock 相当） ── */}
      <View ref={bodyWrap} style={styles.body} collapsable={false}>
      <ScrollView
        ref={verticalScroll}
        contentOffset={{ x: 0, y: 6 * HOUR_PX }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={ghost == null}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        // NativeTabs（iOS 26 Liquid Glass の浮島タブバー）は画面下端に重なって
        // 浮くだけでレイアウト上の余白を確保しない（index.tsx の FAB と同じ
        // 事情。タブバー上端は画面下端から実測 約83pt）。末尾（21〜24時）が
        // タブバーの下に隠れて最後までスクロールできなくなるので、本文の下に
        // タブバーの実測高さぶんだけ余白を足す（FAB の bottom:100 と違い、
        // ここは「隙間なくギリギリ」が目的なので実測値そのまま。余分に足すと
        // 24:00 の下に空白が見えてしまう＝実機フィードバックで判明）。
        contentContainerStyle={{ paddingBottom: 83 }}
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
            scrollEnabled={ghost == null}
            onScroll={syncFromBody}
            scrollEventThrottle={16}
          >
            <GestureDetector gesture={ghostPan}>
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
                const col = eventColors(ev);
                const top = y(p.topMin);
                const height = Math.max(
                  MIN_BLOCK,
                  y(p.endMin) - y(p.topMin),
                );
                // ゴーストとレーン共有する時だけ override（web と同じ）。
                const ov = laneOverrides?.get(p.event.id);
                const lane = ov?.lane ?? p.lane;
                const laneW = COL / (ov?.laneCount ?? p.laneCount);
                return (
                  <Pressable
                    key={p.event.id + p.columnKey}
                    onPress={() => onEventPress(ev)}
                    style={[
                      styles.eventBlock,
                      ev.isDraft && styles.draftBlock,
                      {
                        left: ci * COL + lane * laneW + 1,
                        width: laneW - 2,
                        top,
                        height: height - 1,
                        backgroundColor: col.bg,
                        opacity: col.dim ? 0.5 : 1,
                      },
                    ]}
                  >
                    {/* 開始時刻を先頭に（本家 Google カレンダーと同じ並び）。
                        先頭でも強調はしない＝見た目は従来の eventTime のまま。 */}
                    <Text
                      style={[styles.eventTime, { color: col.text }]}
                      numberOfLines={1}
                    >
                      {spanLabel(p.event) ?? hhmm(p.topMin)}
                    </Text>
                    {draftBadge(ev)}
                    <Text
                      style={[styles.eventTitle, { color: col.text }]}
                      numberOfLines={2}
                    >
                      <ReservationMark ev={ev} textColor={col.text} />
                      {p.event.title}
                    </Text>
                    {/* 場所→メモ（web の blockLabel と同じ優先度: 時刻→タイトル→場所→メモ）。
                        1行に収まらなくても改行で収まりそうなら2行まで見せる
                        （タイトルと同じ扱い）。それでも入らない/ブロックが低い
                        時は eventBlock の overflow:hidden が下から自然に
                        切り詰める（本家 Google マップの週表示と同じ「省略表示」）。 */}
                    {placeName(ev.startPlaceId) && (
                      <Text
                        style={[styles.eventPlace, { color: col.text }]}
                        numberOfLines={2}
                      >
                        {placeName(ev.startPlaceId)}
                      </Text>
                    )}
                    {ev.note && (
                      <Text
                        style={[styles.eventPlace, { color: col.text }]}
                        numberOfLines={2}
                      >
                        {ev.note}
                      </Text>
                    )}
                  </Pressable>
                );
              })}

              {/* 時差移動（出発側・到着側の2ブロック） */}
              {transits.map((t) => {
                const ev = eventById.get(t.event.id);
                if (!ev) return null;
                const col = eventColors(ev);
                const parts: {
                  key: string;
                  ci: number;
                  top: number;
                  height: number;
                  lane: number;
                  laneCount: number;
                  time: number;
                }[] = [];
                const depCi = colIndexByKey.get(t.departColumnKey);
                const arrCi = colIndexByKey.get(t.arriveColumnKey);
                // ゴーストが同じ列に居る側だけレーンを引き直す（web と同じ）。
                const ov = laneOverrides?.get(t.event.id);
                const depOv = ov && ghostColKey === t.departColumnKey;
                const arrOv = ov && ghostColKey === t.arriveColumnKey;
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
                    lane: depOv ? ov.lane : t.departLane,
                    laneCount: depOv ? ov.laneCount : t.departLaneCount,
                    time: t.departMin,
                  });
                }
                if (arrCi != null && t.arriveColumnKey !== t.departColumnKey) {
                  parts.push({
                    key: "arr",
                    ci: arrCi,
                    top: 0,
                    height: Math.max(MIN_BLOCK, y(t.arriveMin)),
                    lane: arrOv ? ov.lane : t.arriveLane,
                    laneCount: arrOv ? ov.laneCount : t.arriveLaneCount,
                    time: t.arriveMin,
                  });
                }
                const pn = placeName(ev.startPlaceId);
                // 2列（出発側/到着側）に分かれる便は、どちらのブロックにも
                // 同じ「出発 - 到着」を出す（片方だけの時刻だとブロックごとに
                // 違う数字が出て統一感がない）。1列で収まる便は今まで通り。
                const timeLabel =
                  parts.length > 1
                    ? `${hhmm(t.departMin)} - ${hhmm(t.arriveMin)}`
                    : null;
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
                        },
                      ]}
                    >
                      {/* 時刻→タイトル→場所→メモの優先度（timed ブロックと同じ）。 */}
                      <Text
                        style={[styles.eventTime, { color: col.text }]}
                        numberOfLines={1}
                      >
                        {timeLabel ?? hhmm(part.time)}
                      </Text>
                      {draftBadge(ev)}
                      <Text
                        style={[styles.eventTitle, { color: col.text }]}
                        numberOfLines={2}
                      >
                        <ReservationMark ev={ev} textColor={col.text} />
                        {t.event.title}
                      </Text>
                      {pn && (
                        <Text
                          style={[styles.eventPlace, { color: col.text }]}
                          numberOfLines={2}
                        >
                          {pn}
                        </Text>
                      )}
                      {ev.note && (
                        <Text
                          style={[styles.eventPlace, { color: col.text }]}
                          numberOfLines={2}
                        >
                          {ev.note}
                        </Text>
                      )}
                    </Pressable>
                  );
                });
              })}

              {/* 長押し中のゴースト枠（1時間・半透明。web と同じ見た目） */}
              {ghost &&
                (() => {
                  const ov = laneOverrides?.get(GHOST_LANE_KEY);
                  const lane = ov?.lane ?? 0;
                  const laneW = COL / (ov?.laneCount ?? 1);
                  return (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.ghostBlock,
                        {
                          left: ghost.columnIndex * COL + lane * laneW + 1,
                          width: laneW - 2,
                          top: y(ghost.startMin),
                          height: HOUR_PX,
                        },
                      ]}
                    >
                      <Text style={styles.ghostTime} numberOfLines={1}>
                        {hhmm(ghost.startMin)}–{hhmm(ghost.startMin + 60)}
                      </Text>
                    </View>
                  );
                })()}
            </View>
            </GestureDetector>
          </ScrollView>
        </View>
      </ScrollView>
      </View>
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
    // 縦は center ではなく上詰め。center だと「タイトル1行だけの列」と
    // 「タイトル+TZ注記2行の列」で中身の高さが違うぶん、タイトルの縦位置が
    // 列ごとにズレてしまう（前進する便の注記は隣の列に張り出すだけで、
    // その列自体は注記を持たないため）。上詰めなら中身の行数に関わらず
    // タイトルの位置は常に揃う。
    justifyContent: "flex-start",
    paddingTop: 4,
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
  // 通常予定のタイトル(eventTitle)と揃える。以前は10pxで理由なく小さかった。
  allDayText: { fontSize: 11, fontWeight: "500", flexShrink: 1 },
  // 場所・メモを同じ行に続けるときの控えめ表示。通常予定の eventPlace と
  // 同じフォントサイズ・opacity（色は親の Text から継承）。
  allDayExtra: { fontSize: 9, opacity: 0.7 },
  // 取り込み下書きの「未確定」チップ（web と同じ塗りチップ/面上の文字トークン）。
  draftBadge: {
    fontSize: 9,
    fontWeight: "600",
    color: t.warnText,
    backgroundColor: t.warnChipBg,
    borderRadius: 3,
    paddingHorizontal: 3,
  },
  // 独立行として置く時だけ要る（Pressable の直下では既定 alignItems:
  // stretch で幅いっぱいに伸びてしまうので、チップの見た目を保つために
  // 内容幅に戻す）。入れ子 Text（draftBadgeLead 側）では効かないが無害。
  draftBadgeOwnLine: { alignSelf: "flex-start", marginBottom: 1 },
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
    paddingHorizontal: 3,
    paddingVertical: 1,
    overflow: "hidden",
  },
  // 移動は出発側/到着側の2ブロックと TZ 注記で既に区別できるので枠は無し。
  transitBlock: {},
  // 取り込み下書きの疑似ブロック（amber 破線）だけ、参加者色の枠線なし統一とは
  // 別の意味（未確定の警告）として独自に枠線を持つ。timed/終日バー共通の値
  // （そもそも RN は borderRadius 付きの枠に破線を適用できず、指定しても
  //  実線で描かれる。web も移動を破線にしていない）。
  draftBlock: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: t.dark ? "rgba(251,191,36,0.5)" : "#fbbf24", // amber-400
  },
  draftBar: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: t.dark ? "rgba(251,191,36,0.5)" : "#fbbf24", // amber-400
  },
  eventTitle: { fontSize: 11, fontWeight: "500", flexShrink: 1 },
  // 終日バー（常に1行）専用。時刻/タイトルブロックの予約マークは折り返しが
  // 要るため row ではなく Text の子として Image を埋め込む（ReservationMark
  // 参照）。1行しか無いここは row で並べても字下げ問題が起きないのでそのまま。
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 2 },
  // 場所（タイトルの次の優先度。web の blockLabel の場所行と同じ薄字）。
  eventPlace: { fontSize: 9, opacity: 0.7 },
  eventTime: { fontSize: 9, opacity: 0.7 },
  // 長押しゴースト（web の border-slate-400 / bg-slate-100/50 / text-slate-800
  // と同値の焼き込み。web も両モード同色）。
  ghostBlock: {
    position: "absolute",
    zIndex: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "rgba(241,245,249,0.5)",
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  ghostTime: {
    fontSize: 10,
    color: "#1e293b",
    opacity: 0.7,
    fontVariant: ["tabular-nums"],
  },
});
