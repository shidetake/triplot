"use client";

import { useActionState, useEffect, useMemo, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@/components/toast";
import { confirmDialog } from "@/components/confirm-dialog";

import { APIProvider } from "@vis.gl/react-google-maps";

import {
  createEventAction,
  deleteEventAction,
  type EventMutationState,
  updateEventAction,
} from "@/app/trips/[tripId]/actions";
import type { LatLng } from "@triplot/shared/placeMap";
import {
  formatMinutes,
  resolveExpenseTz,
  type ScheduleEvent,
  type TripTzTimeline,
} from "@triplot/shared/schedule";
import type { Visibility } from "@triplot/shared/types/database";
import { parseYmd } from "@triplot/shared/ymd";

import { DatePopover } from "./date-popover";
import { DateTimePopover } from "./date-time-popover";
import { InlineDivider } from "./inline-divider";
import { TimezonePicker, tzDisplayLabel } from "./timezone-picker";
import { FieldLabel } from "./field-label";
import { TrashIcon, PlusIcon, SaveIcon, ChevronIcon } from "./icons";
import { PlacePicker, type PlacePickerInitial } from "./place-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CloseButton } from "./close-button";
import { ToggleChip } from "./toggle-chip";
import { MessageBox } from "./message-box";
import { useClearDraft, useDraft, useInSheet } from "./form-host";

const initialState: EventMutationState = { ok: false, error: null };

const inputLayout = "mt-1 block w-full min-w-0"; // <Input>／native <select> 共通レイアウト

// セグメントトラックの各ピル（sr-only native radio を内包）。ui-guidelines「セグメントトラック」。
// sr-only radio に focus が当たるので has-[:focus-visible] でラベル側にリングを出す（a11y）。
const seg =
  "flex flex-1 cursor-pointer items-center justify-center rounded px-2 py-1.5 text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

// グリッド内のフィールド枠。min-w-0 が無いと date/time の実寸でセルが
// 広がり、ポップオーバーから input がはみ出す。
const fieldCls = "block min-w-0 text-sm";

// 予定の3種別。フライトは「予定の一種」なので入口は分けず、ここで切り替える。
//  - timed   : 通常（日付＋時刻。単一TZ）
//  - allday  : 終日（開始日〜終了日。複数日もこれ。TZ無関係）
//  - transit : タイムゾーン跨ぎ（出発と到着で日付もTZも変わる＝フライト等）
type Kind3 = "timed" | "allday" | "transit";

// 壁時計の (date,time) ↔ 通算分。Date.UTC を計算専用に使い、ローカルTZは
// 一切経由しない（floating time を保つ）。
function dtToMin(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 60000) + hh * 60 + mm;
}
function minToDt(min: number): { date: string; time: string } {
  const dayMin = Math.floor(min / 1440) * 1440;
  const d = new Date(dayMin * 60000);
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const rem = min - dayMin;
  return { date, time: formatMinutes(rem) };
}


export type EventFormMode =
  | {
      mode: "create";
      date: string;
      time: string;
      tz: string;
      // 起動時に終日種別を選んでおきたい時のヒント（終日帯の長押し追加経路）。
      allDay?: boolean;
      // PC ドラッグで作成した時の終了時刻("HH:MM")。同日扱い。未指定なら
      // 既存の "開始+1時間" がデフォルト。
      endTime?: string;
    }
  | { mode: "edit"; event: ScheduleEvent; canChangeVisibility: boolean };

function initialKind3(ev: ScheduleEvent | null, allDayHint: boolean): Kind3 {
  if (!ev) return allDayHint ? "allday" : "timed";
  if (ev.kind === "transit") return "transit";
  if (ev.allDay) return "allday";
  return "timed";
}

export function EventForm({
  tripId,
  defaultTz,
  tripStart,
  tripEnd,
  state: formMode,
  places,
  members,
  biasCenter,
  tzTimeline,
  onDone,
}: {
  tripId: string;
  defaultTz: string; // 個別TZの初期値（= 前回入力 or ブラウザTZ）
  tripStart: string | null; // カレンダーの旅行期間ハイライト用
  tripEnd: string | null;
  state: EventFormMode;
  places: { id: string; name: string }[];
  members: { id: string; display_name: string; color: number | null }[];
  biasCenter: LatLng; // Google 検索の地理バイアス（既存ピンの重心 or 東京）
  tzTimeline: TripTzTimeline;
  onDone: () => void;
}) {
  const isEdit = formMode.mode === "edit";
  const ev = isEdit ? formMode.event : null;
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // 場所欄の初期値。編集時は既存の place_id から復元する（自由入力も
  // place_id に解決済みなので saved として戻る）。
  const placePickerInitial: PlacePickerInitial = ev?.placeId
    ? {
        kind: "saved",
        id: ev.placeId,
        name: places.find((p) => p.id === ev.placeId)?.name ?? "",
      }
    : null;

  const action = isEdit
    ? updateEventAction.bind(null, tripId)
    : createEventAction.bind(null, tripId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  // ボトムシート時は入力途中で閉じても残るよう、データ系 state は useDraft で保持する
  // （ポップオーバー時は draftKey が無いので素の useState 相当）。
  const inSheet = useInSheet();
  const clearDraft = useClearDraft();

  const [kind3, setKind3] = useDraft<Kind3>(
    "kind3",
    initialKind3(ev, formMode.mode === "create" && formMode.allDay === true),
  );
  const [visibility, setVisibility] = useDraft<Visibility>(
    "visibility",
    isEdit ? ev!.visibility : "shared",
  );
  // 要予約。ON で「〇〇の予約」TODO（優先度:高）が紐づく。共有予定のみ
  // （private は共有TODOリストに漏れるため）。
  const [needsReservation, setNeedsReservation] = useDraft<boolean>(
    "needsReservation",
    isEdit ? ev!.needsReservation : false,
  );

  // タイトル・メモは元々 uncontrolled（defaultValue）だが、シートのアンマウントを跨いで
  // 残すため controlled にする。
  const [title, setTitle] = useDraft<string>("title", ev?.title ?? "");
  const [note, setNote] = useDraft<string>("note", ev?.note ?? "");

  // 参加者。「全員」モードと「個別」モードの2状態。
  //  - "all"    = 全員参加（送信時は participant_member_ids を一切送らない）
  //  - "custom" = 部分集合（選んだメンバーIDだけ hidden input で送る）
  // 編集モードで既存参加者が居れば最初から custom 開始。
  const initialCustom = isEdit && (ev?.participantMemberIds.length ?? 0) > 0;
  const [pMode, setPMode] = useDraft<"all" | "custom">(
    "pMode",
    initialCustom ? "custom" : "all",
  );
  const [pSelected, setPSelected] = useDraft<Set<string>>("pSelected", () => {
    if (initialCustom) return new Set(ev!.participantMemberIds);
    return new Set(members.map((m) => m.id));
  });
  const toggleParticipant = (id: string) => {
    setPSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // 最後の1人を残す（0 人になると意味不明な予定になる）
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const [isDeleting, startDelete] = useTransition();

  useEffect(() => {
    if (state.ok) {
      clearDraft(); // 成功＝この下書きは用済み（シート時のみ実体あり）
      onDone();
    }
  }, [state.ok, onDone, clearDraft]);

  // 壁時計文字列を date / time に割る
  const splitWall = (s: string | null) => {
    if (!s) return { date: "", time: "" };
    return { date: s.slice(0, 10), time: s.slice(11, 16) };
  };
  const startInit = isEdit
    ? splitWall(ev!.startAt)
    : { date: formMode.date, time: formMode.time };
  const endInit = isEdit ? splitWall(ev!.endAt) : { date: "", time: "" };
  const tzInit = isEdit ? ev!.startTz : formMode.tz;
  const endTzInit = isEdit ? (ev!.endTz ?? defaultTz) : defaultTz;

  // 通常イベントの開始/終了は controlled。開始を動かすと長さを保って
  // 終了が追従。終了は必須で、既定は開始の1時間後。
  const initSMin = dtToMin(
    startInit.date || "2026-01-01",
    startInit.time || "09:00",
  );
  const [sDate, setSDate] = useDraft("sDate", startInit.date || "2026-01-01");
  const [sTime, setSTime] = useDraft("sTime", startInit.time || "09:00");
  const initEMin =
    isEdit && endInit.date
      ? dtToMin(endInit.date, endInit.time || "00:00")
      : formMode.mode === "create" && formMode.endTime
        ? dtToMin(formMode.date, formMode.endTime)
        : initSMin + 60;
  const [eDate, setEDate] = useDraft("eDate", minToDt(initEMin).date);
  const [eTime, setETime] = useDraft("eTime", minToDt(initEMin).time);

  // 通常予定のTZ。transit 日（出発と到着が同日）のみユーザが選択する。
  // それ以外は旅程タイムラインから一意に解決 → UI を出さずに hidden で送る。
  const [tz, setTz] = useDraft("tz", tzInit);
  const tzRes = useMemo(
    () => resolveExpenseTz(sDate, tzTimeline),
    [sDate, tzTimeline],
  );
  const multiTz = tzTimeline.transits.length > 0;

  // 時差移動の到着の既定（新規時）。通常イベントと同様、出発の1時間後。
  // 出発フィールドは uncontrolled なので初期値だけ合わせる（"とりあえず"の既定）。
  const transitArriveInit = minToDt(initSMin + 60);

  // 時差移動は出発・到着をそれぞれ DateTimePopover（日付＋時刻チップ＝通常予定と同じ仕様）で
  // 編集するので、日付・時刻とも controlled state を持つ。出発と到着は別TZ・別日が当たり前
  // なので追従/ガードは入れない（独立。チップは両方とも日付＋時刻をフル表示する）。
  const [departDate, setDepartDate] = useDraft("departDate", startInit.date);
  const [departTime, setDepartTime] = useDraft(
    "departTime",
    startInit.time || "09:00",
  );
  const [arriveDate, setArriveDate] = useDraft(
    "arriveDate",
    endInit.date || transitArriveInit.date,
  );
  const [arriveTime, setArriveTime] = useDraft(
    "arriveTime",
    endInit.time || transitArriveInit.time,
  );
  const [departTz, setDepartTz] = useDraft("departTz", tzInit);
  const [arriveTz, setArriveTz] = useDraft("arriveTz", endTzInit);
  const [alldayStart, setAlldayStart] = useDraft("alldayStart", startInit.date);
  const [alldayEnd, setAlldayEnd] = useDraft(
    "alldayEnd",
    endInit.date || startInit.date,
  );

  // 開始を動かすと長さ（日付込み）を保って終了が追従する（DateTimePopover から呼ぶ）。
  // 日付が変わったら TZ も旅程タイムラインから解決し直す（transit 日は出発側を既定）。
  const moveStart = (nd: string, nt: string) => {
    const dur = Math.max(dtToMin(eDate, eTime) - dtToMin(sDate, sTime), 60);
    setSDate(nd);
    setSTime(nt);
    const ne = minToDt(dtToMin(nd, nt) + dur);
    setEDate(ne.date);
    setETime(ne.time);
    const r = resolveExpenseTz(nd, tzTimeline);
    setTz(r.kind === "single" ? r.tz : r.options[0]);
  };

  // 終了ガード。終了 ≤ 開始になったら開始+1時間に snap する（同日に終了時刻だけ
  // 開始より前にした／前の日付を選んだケースを最小1時間で吸収）。
  const setEnd = (nd: string, nt: string) => {
    const sMin = dtToMin(sDate, sTime);
    const eMin = dtToMin(nd, nt);
    if (eMin <= sMin) {
      const ne = minToDt(sMin + 60);
      setEDate(ne.date);
      setETime(ne.time);
    } else {
      setEDate(nd);
      setETime(nt);
    }
  };

  // allday の開始ガード。終了 picker は開始より前を disable しているので
  // 「終了 → 開始」方向の逆転は picker で防止済み。逆方向（開始を終了より
  // 後にする）が来た場合は単日扱いで end も開始日に揃える。
  const setAlldayStartG = (v: string) => {
    setAlldayStart(v);
    if (v > alldayEnd) setAlldayEnd(v);
  };

  const locale = useLocale();
  const t = useTranslations("event");
  const tCommon = useTranslations("common");
  const KIND3_LABEL: Record<Kind3, string> = {
    timed: t("kindTimed"),
    allday: t("kindAllday"),
    transit: t("kindTransit"),
  };

  const canChangeVis = isEdit ? formMode.canChangeVisibility : true;

  const onDelete = async () => {
    if (!ev) return;
    if (!(await confirmDialog({ title: t("deleteTitle") }))) return;
    startDelete(async () => {
      const { error } = await deleteEventAction(tripId, ev.id);
      if (error) {
        toast(t("deleteFailed", { error }));
        return;
      }
      clearDraft(); // 対象が消えたので下書きも破棄
      onDone();
    });
  };

  // 種別 → サーバ契約（kind / all_day）への写像。hidden で送る。
  const submitKind = kind3 === "transit" ? "transit" : "normal";

  return (
    <form
      action={formAction}
      className="relative space-y-3 rounded-md border border-foreground/10 bg-background p-4"
    >
      {/* × は専用行を作らず右上角に重ねる（縦を 1 行ぶん詰める）。先頭の種別トラックが
          下に潜らないよう、トラック側に右クリアランス（mr）を入れる。
          ボトムシート時は × を出さず下スワイプで閉じる（Instagram と同じ）。 */}
      {!inSheet && (
        <CloseButton onClick={onDone} className="absolute right-2 top-2 z-10" />
      )}

      <input type="hidden" name="kind" value={submitKind} />
      {kind3 === "allday" && (
        <input type="hidden" name="all_day" value="on" />
      )}
      {isEdit && <input type="hidden" name="event_id" value={ev!.id} />}

      {/* 種別の切り替え（通常／終日／タイムゾーン跨ぎ）。
          sr-only の native radio group ＋装飾ラベル（新規/コピーと同じ 1b パターン）。
          右クリアランス mr-7 は × がある時（PC ポップオーバー）だけ＝シートは × が無いので端まで。 */}
      <div
        className={`${inSheet ? "" : "mr-7"} flex gap-1 rounded-md border border-foreground/10 p-1`}
      >
        {(["timed", "allday", "transit"] as const).map((k) => (
          <label
            key={k}
            className={`${seg} ${
              kind3 === k
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-foreground/10"
            }`}
          >
            <input
              type="radio"
              name="__kind3"
              className="sr-only"
              checked={kind3 === k}
              onChange={() => setKind3(k)}
            />
            {KIND3_LABEL[k]}
          </label>
        ))}
      </div>
      {kind3 === "transit" && (
        <p className="-mt-1 text-xs text-muted-foreground">
          {t("transitHint")}
        </p>
      )}

      <label className="block text-sm">
        <FieldLabel required>{t("title")}</FieldLabel>
        <Input
          type="text"
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            kind3 === "transit" ? t("placeholderTitleTransit") : t("placeholderTitle")
          }
          className={inputLayout}
        />
      </label>

      <div className="block text-sm">
        <FieldLabel>{t("place")}</FieldLabel>
        {mapsApiKey ? (
          <APIProvider apiKey={mapsApiKey} language={locale}>
            <PlacePicker
              places={places}
              biasCenter={biasCenter}
              initial={placePickerInitial}
              placeholder={kind3 === "transit" ? t("placeholderPlaceTransit") : t("placeholderPlace")}
            />
          </APIProvider>
        ) : (
          <PlacePicker
            places={places}
            biasCenter={biasCenter}
            initial={placePickerInitial}
            placeholder={kind3 === "transit" ? t("placeholderPlaceTransit") : t("placeholderPlace")}
          />
        )}
      </div>

      {/* 出発＝日付＋時刻、到着＝時刻（別日なら ±N日）の横並び。通常予定の「開始 – 終了」と同じ表示。
          出発・到着は別TZが前提なので追従/ガードは入れず独立（到着は前日 -1日もあり得るので
          到着エディタの日付制限もしない）。 */}
      {kind3 === "transit" && (
        <div className="space-y-3">
          <div>
            <span className="text-sm text-muted-foreground">{t("dateTime")}</span>
            <div className="mt-1 flex items-center gap-2">
              <DateTimePopover
                variant="start"
                date={departDate}
                time={departTime}
                onChange={(d, td) => {
                  setDepartDate(d);
                  setDepartTime(td);
                }}
                tripStart={tripStart}
                tripEnd={tripEnd}
                label={t("departDateTime")}
              />
              <span className="shrink-0 text-muted-foreground">–</span>
              <DateTimePopover
                variant="end"
                date={arriveDate}
                time={arriveTime}
                baseDate={departDate}
                onChange={(d, td) => {
                  setArriveDate(d);
                  setArriveTime(td);
                }}
                tripStart={tripStart}
                tripEnd={tripEnd}
                label={t("arriveDateTime")}
              />
            </div>
          </div>

          <input type="hidden" name="depart_date" value={departDate} />
          <input type="hidden" name="depart_time" value={departTime} />
          <input type="hidden" name="arrive_date" value={arriveDate} />
          <input type="hidden" name="arrive_time" value={arriveTime} />

          {/* 出発地/到着地のタイムゾーンを1行2列に。検索式ピッカーで全ゾーンから選べる。 */}
          <div className="grid grid-cols-2 gap-2">
            <label className={`${fieldCls} mt-1 block`}>
              <span className="text-muted-foreground">{t("departTz")}</span>
              <div className="mt-1">
                <TimezonePicker
                  name="depart_tz"
                  value={departTz}
                  onChange={setDepartTz}
                />
              </div>
            </label>
            <label className={`${fieldCls} mt-1 block`}>
              <span className="text-muted-foreground">{t("arriveTz")}</span>
              <div className="mt-1">
                <TimezonePicker
                  name="arrive_tz"
                  value={arriveTz}
                  onChange={setArriveTz}
                />
              </div>
            </label>
          </div>
        </div>
      )}

      {kind3 === "allday" && (
        // 開始日–終了日を横並び（通常予定の日時と同じ並び・時刻なし）。
        // 入力は従来どおりカレンダーのみ（DatePopover）。終日はTZ無関係（tz は送らない）。
        <div>
          <span className="text-sm text-muted-foreground">{t("date")}</span>
          <div className="mt-1 flex items-center gap-2">
            <DatePopover
              name="start_date"
              value={alldayStart}
              onChange={setAlldayStartG}
              required
              className="w-auto shrink-0"
              tripStart={tripStart}
              tripEnd={tripEnd}
            />
            <span className="shrink-0 text-muted-foreground">–</span>
            <DatePopover
              name="end_date"
              value={alldayEnd}
              onChange={setAlldayEnd}
              required
              className="w-auto shrink-0"
              tripStart={tripStart}
              tripEnd={tripEnd}
              disabled={
                parseYmd(alldayStart)
                  ? { before: parseYmd(alldayStart)! }
                  : undefined
              }
            />
          </div>
        </div>
      )}

      {kind3 === "timed" && (
        <div className="space-y-3">
          {/* 開始＝日付＋時刻、終了＝時刻（＋別日なら「+N日」）の 2 つの要約チップ。
              どちらをタップしても同じ結合エディタ（カレンダー＋時刻）が開く＝iOS カレンダー方式。
              送信値は hidden で流す（チップは UI 専用の controlled 部品）。 */}
          <div>
            <span className="text-sm text-muted-foreground">{t("dateTime")}</span>
            <div className="mt-1 flex items-center gap-2">
              <DateTimePopover
                variant="start"
                date={sDate}
                time={sTime}
                onChange={moveStart}
                tripStart={tripStart}
                tripEnd={tripEnd}
                label={t("startDateTime")}
              />
              <span className="shrink-0 text-muted-foreground">–</span>
              <DateTimePopover
                variant="end"
                date={eDate}
                time={eTime}
                baseDate={sDate}
                onChange={setEnd}
                tripStart={tripStart}
                tripEnd={tripEnd}
                disabled={
                  parseYmd(sDate) ? { before: parseYmd(sDate)! } : undefined
                }
                label={t("endDateTime")}
              />
            </div>
          </div>

          <input type="hidden" name="start_date" value={sDate} />
          <input type="hidden" name="start_time" value={sTime} />
          <input type="hidden" name="end_date" value={eDate} />
          <input type="hidden" name="end_time" value={eTime} />

          {/* TZ は常に hidden で送る。transit 日（同日に出発/到着が両方ある）のみ
              ラジオで出発側/到着側を選ばせる。それ以外はタイムラインから一意に解決。 */}
          <input type="hidden" name="tz" value={tz} />
          {multiTz && tzRes.kind === "ambiguous" && (
            <fieldset className="text-sm">
              <p className="text-xs text-muted-foreground">{t("transitDay")}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                {tzRes.options.map((opt, i) => (
                  <label key={`${opt}-${i}`} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="tz_choice"
                      checked={tz === opt}
                      onChange={() => setTz(opt)}
                    />
                    <span>{tzDisplayLabel(opt)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {/* メモは公開範囲などの設定オプションより上に置く（費用フォームと並びを統一）。 */}
      <label className="block text-sm">
        <FieldLabel>{t("memo")}</FieldLabel>
        <Input
          type="text"
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind3 === "transit" ? t("placeholderNoteTransit") : t("placeholderNote")}
          className={inputLayout}
        />
      </label>

      {/* 公開範囲 と 要予約 を同一行に左詰め＋縦区切り線で同居（1行節約）。両者は無関係な
          設定なので、付属物に見えないよう区切り線で「別グループ」と示す。要予約は公開範囲に
          依らず常に出す（private 予定でも予約は要る）。ON で予約TODOが紐づき、その可視範囲は
          予定の公開範囲を継承する（private→作成者だけに見える）。 */}
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{t("visibility")}</span>
          {canChangeVis ? (
            <div className="flex gap-3" role="radiogroup" aria-label={t("visibility")}>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="visibility"
                  value="shared"
                  checked={visibility === "shared"}
                  onChange={() => setVisibility("shared")}
                />
                <span>{t("visibilityShared")}</span>
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === "private"}
                  onChange={() => setVisibility("private")}
                />
                <span>{t("visibilitySelfOnly")}</span>
              </label>
            </div>
          ) : (
            <>
              <span className="text-muted-foreground">
                {visibility === "shared" ? t("visibilityShared") : t("visibilitySelfOnly")}
              </span>
              <input type="hidden" name="visibility" value={visibility} />
            </>
          )}
        </div>
        <InlineDivider className="h-4" />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="needs_reservation"
            checked={needsReservation}
            onChange={(e) => setNeedsReservation(e.target.checked)}
          />
          <FieldLabel>{t("needsReservation")}</FieldLabel>
        </label>
      </div>

      {/* 参加者。共有予定のみ意味がある（private は作成者本人だけが当事者なので
          省略）。デフォルトは「参加者: 全員」＋下向きシェブロンの disclosure。タップで展開して
          チップで選択できるようになる。展開状態は「参加者: 一部」＋上向きシェブロンで、再
          タップでチップを畳んで全員に戻す。送信は pMode=custom の時だけ hidden
          input を生やし、それ以外は何も送らない（=全員のシュガー）。 */}
      {visibility === "shared" && members.length > 1 && (
        <div className="text-sm">
          <button
            type="button"
            onClick={() => {
              if (pMode === "all") {
                setPMode("custom");
              } else {
                setPMode("all");
                setPSelected(new Set(members.map((m) => m.id)));
              }
            }}
            aria-expanded={pMode === "custom"}
            className="inline-flex items-center gap-1 rounded font-medium text-muted-foreground transition hover:text-foreground"
          >
            <span>{t("participants")}: {pMode === "all" ? t("participantsAll") : t("participantsSome")}</span>
            <ChevronIcon
              size={16}
              className={`transition-transform ${pMode === "all" ? "rotate-90" : "-rotate-90"}`}
            />
          </button>
          {pMode === "custom" && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {members.map((m) => {
                const on = pSelected.has(m.id);
                return (
                  <ToggleChip
                    key={m.id}
                    on={on}
                    hue={m.color}
                    onClick={() => toggleParticipant(m.id)}
                  >
                    {m.display_name}
                  </ToggleChip>
                );
              })}
            </div>
          )}
          {pMode === "custom" &&
            Array.from(pSelected).map((id) => (
              <input
                key={id}
                type="hidden"
                name="participant_member_ids"
                value={id}
              />
            ))}
        </div>
      )}

      <div className="flex gap-2">
        {isEdit && (
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
        <Button
          type="submit"
          disabled={isPending}
          aria-label={isEdit ? tCommon("save") : tCommon("add")}
          title={isEdit ? tCommon("save") : tCommon("add")}
          className="flex-1"
        >
          {isEdit ? <SaveIcon size={20} /> : <PlusIcon size={20} />}
        </Button>
      </div>

      {state.error && (
        <MessageBox kind="error" dense>
          {state.error}
        </MessageBox>
      )}
    </form>
  );
}
