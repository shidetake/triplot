import { useCallback, useEffect, useRef, useState } from "react";
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
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useTranslations } from "use-intl";

import {
  maxHourPx,
  zoomAnchoredScrollY,
  zoomedHourPx,
} from "@triplot/shared/calendarZoom";
import {
  eventBlockColors,
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
import { dotStyle } from "@/lib/themeColor";

const ticketMarkSource = require("../../assets/marks/reservation-ticket.png");
const checkMarkSource = require("../../assets/marks/reservation-check.png");

// 週カレンダーの描画（RN）。レイアウト計算は shared の buildSchedule に委ね、
// ここはその出力（列・配置済みブロック・終日バー）を描くだけ（web の
// week-calendar.tsx と同じ役割分担）。寸法も web に合わせる。

const GUTTER = 44; // 時刻ガター幅
// 1時間の高さ。**縦ピンチで変えられる**（Google カレンダーと同じ）。この値は
// 既定であり最小＝一番引いた状態で、ここから拡大していく。上限と寄せ直しの
// 計算は calendarZoom（純関数・テストあり）が持つ。
const HOUR_PX_MIN = 30;
const ALLDAY_ROW = 24; // 終日バー1行の高さ
const HEADER_H = 34; // 日付ヘッダの高さ（TZ注記あり）
const HEADER_H_COMPACT = 22; // 日付ヘッダの高さ（TZ注記なし＝日付ラベルのみ）
const MIN_BLOCK = 18; // ブロック最低高さ

// ブロックの高さから、時刻＋（下書きバッジ）＋タイトル1行を確保した「残り」で
// 場所/メモに回せる行数を返す。既定の HOUR_PX=30 だと1時間の予定でも
// 時刻(fontSize9)+タイトル(fontSize11)だけで既に高さの大半を使い切り、
// 場所（fontSize9）を無条件で描くと場所がタイトルを押しのけて主役に見えて
// しまっていた（実機フィードバック: 短い予定でタイトルがほぼ見えず、場所の
// 店名だけが目立って見えた）。タイトルは1行ぶん必ず確保し、それでも余りが
// 無ければ場所・メモは一切出さない（タイトルを削ってまで場所を見せない）。
// 値は各 style のフォントサイズからの概算。

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
  onAllDaySlotPick,
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
  // 終日帯の長押し→横ドラッグ→離した日付で終日予定を追加（web と同じ）。
  onAllDaySlotPick?: (date: string) => void;
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
  // 縦ピンチの倍率は「1時間の高さ」そのもので持つ（描画は全部この値から引く）。
  const [hourPx, setHourPx] = useState(HOUR_PX_MIN);
  // 本体（時間グリッド）の見えている高さ。上限を「6時間ぶんが入る高さ」に
  // するために要る。測れるまでは既定の3倍を仮に使う。
  const [bodyViewportH, setBodyViewportH] = useState(0);
  // ピンチ中は縦スクロールを止める。2本指を広げる動きは UIScrollView も
  // スクロールとして拾うので、そのままだと寄せ直した位置を上書きされる
  // （ゴースト中に止めるのと同じ考え方）。scrollTo は止めていても効く。
  const [pinching, setPinching] = useState(false);

  // **指を動かしている間はレイアウトし直さない。** 毎フレーム hourPx を state に
  // 書くと、時刻線・全ブロック・ガターを JS スレッドで作り直すことになり、実機で
  // はっきりカクつく（実機フィードバック）。ピンチ中は UI スレッドの変形
  // （縦方向の拡大）だけで見せ、**指を離した時に一度だけ**本物の高さに直す。
  const zoomScale = useSharedValue(1);
  const zoomTy = useSharedValue(0);
  // worklet から読む値（JS の state / ref は worklet から触れない）。
  const hourPxSv = useSharedValue(HOUR_PX_MIN);
  const scrollYSv = useSharedValue(6 * HOUR_PX_MIN);
  const zoomMaxSv = useSharedValue(HOUR_PX_MIN * 3);
  const zStartHourPx = useSharedValue(HOUR_PX_MIN);
  const zFocalY = useSharedValue(0);
  const zFocalMin = useSharedValue(0);
  const zScrollY = useSharedValue(0);
  const zScale = useSharedValue(1);
  useEffect(() => {
    zoomMaxSv.value = maxHourPx(bodyViewportH, HOUR_PX_MIN);
  }, [bodyViewportH, zoomMaxSv]);

  // 拡大の見せかけ。ブロックの高さも時刻線の間隔もこれで一緒に伸びる。
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: zoomTy.value }, { scaleY: zoomScale.value }],
  }));
  // 中の文字は伸ばさない（逆向きに縮めて元の字面に戻す）。値は全要素で同じなので
  // スタイルは1つを使い回せる。
  const zoomTextStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: 1 / zoomScale.value }],
  }));
  const bodyH = 24 * hourPx;
  // TZ注記が無い週は、注記ぶんの高さを空けておく必要が無いので薄くする
  // （前進する便の注記があるときだけ広げる。日付ラベルだけの週は詰める）。
  const headerH = groups.some((g) => g.tzNote) ? HEADER_H : HEADER_H_COMPACT;
  const colIndexByKey = new Map(columns.map((c, i) => [c.key, i]));
  const eventById = new Map(events.map((e) => [e.id, e]));

  const y = (min: number) => (Math.min(Math.max(min, 0), 1440) / 60) * hourPx;

  // 現在のスクロール量（auto-scroll と指位置→グリッド座標の変換に使う）。
  const scrollXRef = useRef(0);
  const scrollYRef = useRef(6 * HOUR_PX_MIN); // contentOffset 初期値と同じ

  // ヘッダ（日付＋終日バー）と本体は横スクロールを同期する。**どちらを触っても
  // 動く** — 終日の予定が並ぶ帯は面積が大きく、そこを掴んで横に振るのは自然な
  // 操作なのに、以前は何も起きなかった（実機フィードバック）。
  //
  // 双方向にすると発振する（片方の scrollTo がもう片方の onScroll を呼び、
  // それがまた scrollTo を返す。右端のバウンス中に止まらなくなる）。**今どちらが
  // 操作元かを持ち、操作元でない側の onScroll は無視する**ことで断ち切る。
  // **操作元は「最後に指で触った側」。解除しない。** 一度でも「今は誰も操作元
  // でない」状態を作ると、そこで両側が同期し合って発振する（慣性やバウンスの
  // 最中に起きる）。次に反対側を触った時に上書きされるので、解除は要らない。
  const driver = useRef<"body" | "header">("body");
  const syncFromBody = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (driver.current !== "body") return;
    scrollXRef.current = e.nativeEvent.contentOffset.x;
    headerScroll.current?.scrollTo({
      x: e.nativeEvent.contentOffset.x,
      animated: false,
    });
  };
  const syncFromHeader = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (driver.current !== "header") return;
    scrollXRef.current = e.nativeEvent.contentOffset.x;
    bodyScroll.current?.scrollTo({
      x: e.nativeEvent.contentOffset.x,
      animated: false,
    });
  };
  const dragBody = () => {
    driver.current = "body";
  };
  const dragHeader = () => {
    driver.current = "header";
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
      const raw = (contentY / hourPx) * 60;
      const snapped = Math.max(0, Math.min(1380, Math.round(raw / 30) * 30));
      return {
        columnIndex: Math.max(
          0,
          Math.min(columns.length - 1, Math.floor(contentX / COL)),
        ),
        startMin: Math.max(0, snapped - 30),
      };
    },
    [columns.length, COL, hourPx],
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
      // 自前で動かす時は両方に指示する（onScroll 経由の同期は操作元でない側を
      // 無視するので、片方だけだとずれる）。
      bodyScroll.current?.scrollTo({ x: scrollXRef.current, animated: false });
      headerScroll.current?.scrollTo({ x: scrollXRef.current, animated: false });
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

  // 縦ピンチで時間の縮尺を変える（Google カレンダーと同じ）。**指の間にある
  // 時刻を動かさない** — 拡大すると自分が見ていた時間帯が画面外へ流れていく
  // ので、焦点の時刻を固定してスクロール位置を寄せ直す。
  //
  // 2本指なので、1本指のスクロール・長押しドラッグとは指の本数で切り分く。
  // 縦スクロールとは同時に成立させる（ピンチ中に scrollTo で寄せ直すため）。
  //
  // zoomScale/zoomTy/hourPxSv 等は reanimated の SharedValue（ref と同じ可変
  // コンテナ）で、react-hooks/immutability はまだ区別できないため、この関数の
  // 中だけ無効化する（places.tsx の applyPickerFocus と同じ対処）。
  /* eslint-disable react-hooks/immutability */
  // 指を離した時だけ本物の高さに直す（ここだけ React の再描画が走る）。
  const commitZoom = useCallback(() => {
    const next = zoomedHourPx(
      zStartHourPx.value,
      zScale.value,
      HOUR_PX_MIN,
      zoomMaxSv.value,
    );
    const y2 = zoomAnchoredScrollY({
      focalMin: zFocalMin.value,
      focalY: zFocalY.value,
      hourPx: next,
      viewportH: bodyViewportH,
    });
    setHourPx(next);
    hourPxSv.value = next;
    scrollYRef.current = y2;
    scrollYSv.value = y2;
    verticalScroll.current?.scrollTo({ y: y2, animated: false });
    zoomScale.value = 1;
    zoomTy.value = 0;
    setPinching(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyViewportH]);
  /* eslint-enable react-hooks/immutability */

  // 縦ピンチ。**onUpdate は worklet（UI スレッド）**で、共有値を書き換えるだけ。
  // 指の間にある時刻を動かさないよう、拡大と同時に平行移動で引き戻す。
  // runOnJS(commitZoom) は ghostPan と同じ理由で react-hooks/refs も無効化する
  // （Gesture ビルダーはコールバックを保存するだけで、実行はジェスチャー
  // イベント時のみ）。
  /* eslint-disable react-hooks/immutability, react-hooks/refs */
  const zoomPinch = Gesture.Pinch()
    .onBegin((e) => {
      "worklet";
      zStartHourPx.value = hourPxSv.value;
      zFocalY.value = e.focalY;
      zFocalMin.value =
        ((scrollYSv.value + e.focalY) / hourPxSv.value) * 60;
      zScrollY.value = scrollYSv.value;
      zScale.value = 1;
      runOnJS(setPinching)(true);
    })
    .onUpdate((e) => {
      "worklet";
      // 上限・下限で視覚的にも止める（commit と同じ式。確定値は commit 側の
      // zoomedHourPx が決めるので、ここは見せかけ）。
      const target = Math.min(
        zoomMaxSv.value,
        Math.max(HOUR_PX_MIN, zStartHourPx.value * e.scale),
      );
      const s2 = target / zStartHourPx.value;
      zScale.value = e.scale;
      zoomScale.value = s2;
      // 焦点の内容座標（拡大前）。拡大後にここが同じ高さへ来るよう戻す。
      const y0 = (zFocalMin.value / 60) * zStartHourPx.value;
      zoomTy.value = zFocalY.value - (y0 * s2 - zScrollY.value);
    })
    .onFinalize(() => {
      "worklet";
      runOnJS(commitZoom)();
    });
  /* eslint-enable react-hooks/immutability, react-hooks/refs */

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

  // ── 終日帯の長押し→横ドラッグで日付を選び、離して終日予定を追加 ──
  // 時間グリッドのゴーストと同じ操作感（長押しで発動・ドラッグ中は対象が
  // 動く・離して確定）。終日は日付だけ決まればよいので横方向だけ見る。
  // 終日の予定が1件も無い週でも押せるよう、下の帯は常に1行ぶんの高さを持つ。
  const [allDayGhostCol, setAllDayGhostColState] = useState<number | null>(null);
  const allDayGhostRef = useRef<number | null>(null);
  const setAllDayGhostCol = useCallback((i: number | null) => {
    allDayGhostRef.current = i;
    setAllDayGhostColState(i);
  }, []);
  // 帯の内容座標 x → 列インデックス（帯は横スクロール内容の中にあるので
  // e.x はそのまま内容座標）。
  const colFromX = useCallback(
    (x: number) =>
      Math.max(0, Math.min(columns.length - 1, Math.floor(x / COL))),
    [columns.length, COL],
  );
  const onAllDayStart = useCallback(
    (e: { x: number }) => setAllDayGhostCol(colFromX(e.x)),
    [colFromX, setAllDayGhostCol],
  );
  const onAllDayUpdate = useCallback(
    (e: { x: number }) => {
      const i = colFromX(e.x);
      if (i !== allDayGhostRef.current) setAllDayGhostCol(i);
    },
    [colFromX, setAllDayGhostCol],
  );
  const onAllDayEnd = useCallback(() => {
    const i = allDayGhostRef.current;
    const col = i != null ? columns[i] : null;
    if (col) onAllDaySlotPick?.(col.date);
  }, [columns, onAllDaySlotPick]);
  const onAllDayFinalize = useCallback(
    () => setAllDayGhostCol(null),
    [setAllDayGhostCol],
  );

  /* eslint-disable react-hooks/refs */
  const allDayPan = Gesture.Pan()
    .maxPointers(1)
    .activateAfterLongPress(500)
    .runOnJS(true)
    .onStart(onAllDayStart)
    .onUpdate(onAllDayUpdate)
    .onEnd(onAllDayEnd)
    .onFinalize(onAllDayFinalize);
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
    mixed: false,
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
        mixed: c.kind === "mixed",
      };
    }
    const cols = eventBlockColors(hue, false);
    const m = t.dark ? "dark" : "light";
    return {
      bg: cols.bg[m],
      text: cols.fg[m],
      dim: false,
      mixed: c.kind === "mixed",
    };
  };

  // mixed（2名以上・全員未満）の予定に出す参加者ドット列。「誰が参加か」を
  // 各メンバーの hue ドットで示す。自分が参加している時は地色が自分の hue に
  // なりドットが埋もれるので、自分は除外する（web の participantDots と同じ）。
  const participantDots = (ev: EventRow) => (
    <View style={styles.dotRow}>
      {ev.participantMemberIds
        .filter((id) => id !== myMemberId)
        .map((id) => (
          <View
            key={id}
            style={[
              styles.dot,
              dotStyle(memberHueById.get(id) ?? null, t.dark),
            ]}
          />
        ))}
    </View>
  );

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
          // ゴースト（長押しドラッグ）中は本体と同じく止める。
          scrollEnabled={ghost == null}
          showsHorizontalScrollIndicator={false}
          onScroll={syncFromHeader}
          onScrollBeginDrag={dragHeader}
          scrollEventThrottle={16}
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
            {/* 終日バー行。長押しで終日予定を追加できるよう、終日の予定が
                無い週でも1行ぶんの高さを確保する（web と同じ）。 */}
            <GestureDetector gesture={allDayPan}>
              <View
                style={[
                  styles.allDayArea,
                  { height: Math.max(allDayRowCount, 1) * ALLDAY_ROW },
                ]}
              >
                {/* 長押し中のゴースト（確定するとこの日の終日予定になる）。 */}
                {allDayGhostCol != null && (
                  <View
                    style={[
                      styles.allDayGhost,
                      { left: allDayGhostCol * COL + 2, width: COL - 4 },
                    ]}
                  />
                )}
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
                        {/* mixed は右肩に参加者ドット（web の終日バーと同じ）。 */}
                        {col.mixed && participantDots(ev)}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </GestureDetector>
          </View>
        </ScrollView>
      </View>

      {/* ── 本体（時間グリッド）。縦スクロール。ゴースト中は2軸とも
          スクロールを止めてドラッグに専念させる（web の scroll lock 相当） ── */}
      <View
        ref={bodyWrap}
        style={styles.body}
        collapsable={false}
        onLayout={(e) => setBodyViewportH(e.nativeEvent.layout.height)}
      >
      <GestureDetector gesture={zoomPinch}>
      <ScrollView
        ref={verticalScroll}
        contentOffset={{ x: 0, y: 6 * HOUR_PX_MIN }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={ghost == null && !pinching}
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
        <Animated.View style={[styles.bodyRow, zoomStyle]}>
          {/* 時刻ガター（固定・縦だけスクロール） */}
          <View style={{ width: GUTTER, height: bodyH }}>
            {Array.from({ length: 24 }, (_, h) => (
              <Animated.View
                key={h}
                style={[styles.gutterHour, { top: h * hourPx }, zoomTextStyle]}
              >
                <Text style={styles.gutterLabel}>{h}:00</Text>
              </Animated.View>
            ))}
          </View>

          {/* 日列（横スクロール） */}
          <ScrollView
            ref={bodyScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled={ghost == null}
            onScroll={syncFromBody}
            onScrollBeginDrag={dragBody}
            scrollEventThrottle={16}
          >
            <GestureDetector gesture={ghostPan}>
            <View style={{ width: totalW, height: bodyH }}>
              {/* 時間グリッド線 */}
              {Array.from({ length: 25 }, (_, h) => (
                <View
                  key={h}
                  style={[styles.hourLine, { top: h * hourPx, width: totalW }]}
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
                    <Animated.View style={zoomTextStyle}>
                      {/* 開始時刻を先頭に（本家 Google カレンダーと同じ並び）。
                          先頭でも強調はしない＝見た目は従来の eventTime のまま。
                          mixed の予定は右肩に参加者ドットを出す（ui-guidelines
                          「色（メンバー・予定）」）。 */}
                      <View style={styles.timeRow}>
                        <Text
                          style={[styles.eventTime, { color: col.text }]}
                          numberOfLines={1}
                        >
                          {spanLabel(p.event) ?? hhmm(p.topMin)}
                        </Text>
                        {col.mixed && participantDots(ev)}
                      </View>
                      {draftBadge(ev)}
                      <Text
                        style={[styles.eventTitle, { color: col.text }]}
                        numberOfLines={2}
                      >
                        <ReservationMark ev={ev} textColor={col.text} />
                        {p.event.title}
                      </Text>
                      {/* 場所→メモ（web の blockLabel と同じ優先度: 時刻→タイトル→場所→メモ）。
                          折り返しも行数も制限せずそのまま書く。ブロックは
                          overflow: hidden なので入らない分はブロックが切る
                          （上限を決め打ちすると「高さが余っているのに出ない」が
                          起きる）。 */}
                      {[placeName(ev.startPlaceId), ev.note]
                        .filter((x): x is string => Boolean(x))
                        .map((text, i) => (
                          <Text
                            key={i}
                            style={[styles.eventPlace, { color: col.text }]}
                          >
                            {text}
                          </Text>
                        ))}
                    </Animated.View>
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
                        ev.isDraft && styles.draftBlock,
                        {
                          left: part.ci * COL + part.lane * laneW + 1,
                          width: laneW - 2,
                          top: part.top,
                          height: part.height - 1,
                          backgroundColor: col.bg,
                        },
                      ]}
                    >
                      {/* 時刻→タイトル→場所→メモの優先度（timed ブロックと同じ）。
                          mixed は右肩に参加者ドット（web の時差移動と同じ）。 */}
                      <Animated.View style={zoomTextStyle}>
                        <View style={styles.timeRow}>
                          <Text
                            style={[styles.eventTime, { color: col.text }]}
                            numberOfLines={1}
                          >
                            {timeLabel ?? hhmm(part.time)}
                          </Text>
                          {col.mixed && participantDots(ev)}
                        </View>
                        {draftBadge(ev)}
                        <Text
                          style={[styles.eventTitle, { color: col.text }]}
                          numberOfLines={2}
                        >
                          <ReservationMark ev={ev} textColor={col.text} />
                          {t.event.title}
                        </Text>
                        {/* 通常の予定と同じく、行数を制限せず書いてブロックに切らせる。 */}
                        {[pn, ev.note]
                          .filter((x): x is string => Boolean(x))
                          .map((text, i) => (
                            <Text
                              key={i}
                              style={[styles.eventPlace, { color: col.text }]}
                            >
                              {text}
                            </Text>
                          ))}
                      </Animated.View>
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
                          height: hourPx,
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
        </Animated.View>
      </ScrollView>
      </GestureDetector>
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
  // 日付ラベルと同じく中央揃え（web は親の text-center を継承している）。
  // alignItems だけでは箱が中央に来るだけで、固定幅の箱の中の文字は左端に
  // 寄ったままになる。
  tzNote: { fontSize: 9, color: t.mutedForeground, textAlign: "center" },
  // 時刻＋参加者ドットの行（ドットは右寄せ）。
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 2,
  },
  dotRow: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0 },
  dot: { width: 6, height: 6, borderRadius: 3 },
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
  // 終日帯の長押しゴースト（時間グリッドのゴーストと同じ半透明の primary）。
  allDayGhost: {
    position: "absolute",
    top: 1,
    height: ALLDAY_ROW - 2,
    borderRadius: 4,
    backgroundColor: t.fgAlpha(0.18),
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
  // flexShrink: 0 ＝ ブロックが低くてもタイトルは縮まない。RN の <Text> は
  // 既定で縦に縮むので、下に続く場所・メモに押されてタイトルが線になって
  // しまう（行数制限を外した時に発生）。はみ出す分は下の場所・メモ側が
  // ブロックの overflow: hidden で切られる。
  eventTitle: { fontSize: 11, fontWeight: "500", flexShrink: 0 },
  // 終日バー（常に1行）専用。時刻/タイトルブロックの予約マークは折り返しが
  // 要るため row ではなく Text の子として Image を埋め込む（ReservationMark
  // 参照）。1行しか無いここは row で並べても字下げ問題が起きないのでそのまま。
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 2 },
  // 場所（タイトルの次の優先度。web の blockLabel の場所行と同じ薄字）。
  eventPlace: { fontSize: 9, opacity: 0.7 },
  // 時刻もタイトルと同じく縮ませない（上から順に読める状態を保つ）。
  eventTime: { fontSize: 9, opacity: 0.7, flexShrink: 0 },
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
