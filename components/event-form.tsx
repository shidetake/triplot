"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { confirmDialog } from "@/components/confirm-dialog";

import { APIProvider } from "@vis.gl/react-google-maps";

import {
  createEventAction,
  deleteEventAction,
  type EventMutationState,
  updateEventAction,
} from "@/app/trips/[tripId]/actions";
import type { LatLng } from "@/lib/placeMap";
import { formatMinutes, type ScheduleEvent } from "@/lib/schedule";
import type { Visibility } from "@/lib/types/database";
import { parseYmd } from "@/lib/ymd";

import { DatePopover } from "./date-popover";
import { inputClass } from "./input-class";
import { FieldLabel } from "./field-label";
import {
  TrashIcon,
  PlusIcon,
  SaveIcon,
  ChevronIcon,
  CalendarRangeIcon,
} from "./icons";
import { PlacePicker, type PlacePickerInitial } from "./place-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CloseButton } from "./close-button";
import { ToggleChip } from "./toggle-chip";
import { MessageBox } from "./message-box";

// 旅行でよく使うTZの短いリスト。先頭は旅行の既定TZ（呼び出し側で差し込む）。
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Asia/Tokyo", label: "日本 (Asia/Tokyo)" },
  { value: "Pacific/Honolulu", label: "ハワイ (Pacific/Honolulu)" },
  { value: "America/Los_Angeles", label: "米国西海岸 (America/Los_Angeles)" },
  { value: "America/New_York", label: "米国東海岸 (America/New_York)" },
  { value: "Europe/London", label: "イギリス (Europe/London)" },
  { value: "Europe/Paris", label: "中央欧州 (Europe/Paris)" },
  { value: "Asia/Bangkok", label: "タイ (Asia/Bangkok)" },
  { value: "Asia/Seoul", label: "韓国 (Asia/Seoul)" },
  { value: "Asia/Singapore", label: "シンガポール (Asia/Singapore)" },
  { value: "Asia/Taipei", label: "台湾 (Asia/Taipei)" },
  { value: "Asia/Shanghai", label: "中国 (Asia/Shanghai)" },
  { value: "Asia/Hong_Kong", label: "香港 (Asia/Hong_Kong)" },
  { value: "Australia/Sydney", label: "シドニー (Australia/Sydney)" },
  { value: "Pacific/Guam", label: "グアム (Pacific/Guam)" },
];

const initialState: EventMutationState = { ok: false, error: null };

const inputLayout = "mt-1 block w-full min-w-0"; // <Input>／native <select> 共通レイアウト
const inputCls = `${inputLayout} ${inputClass}`; // native <select> 用（recipe 込み）

// セグメントトラックの各ピル（sr-only native radio を内包）。design-guidelines「セグメントトラック」。
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

const KIND3_LABEL: Record<Kind3, string> = {
  timed: "通常",
  allday: "終日",
  transit: "時差移動",
};

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

// "HH:MM" → 0時からの分（壁時計の時刻のみ。日付は別管理）
function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
// "YYYY-MM-DD" の翌日
function addOneDay(ymd: string): string {
  return minToDt(dtToMin(ymd, "00:00") + 1440).date;
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

function TzSelect({ name, value }: { name: string; value: string }) {
  const opts = [...TIMEZONE_OPTIONS];
  if (value && !opts.some((o) => o.value === value)) {
    opts.unshift({ value, label: value });
  }
  return (
    <select name={name} defaultValue={value} className={inputCls}>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

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
  onDone,
}: {
  tripId: string;
  defaultTz: string; // 個別TZの初期値（= 前回入力 or ブラウザTZ）
  tripStart: string | null; // カレンダーの旅行期間ハイライト用
  tripEnd: string | null;
  state: EventFormMode;
  places: { id: string; name: string }[];
  members: { id: string; display_name: string }[];
  biasCenter: LatLng; // Google 検索の地理バイアス（既存ピンの重心 or 東京）
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

  const [kind3, setKind3] = useState<Kind3>(
    initialKind3(ev, formMode.mode === "create" && formMode.allDay === true),
  );
  const [visibility, setVisibility] = useState<Visibility>(
    isEdit ? ev!.visibility : "shared",
  );
  // 要予約。ON で「〇〇の予約」TODO（優先度:高）が紐づく。共有予定のみ
  // （private は共有TODOリストに漏れるため）。
  const [needsReservation, setNeedsReservation] = useState<boolean>(
    isEdit ? ev!.needsReservation : false,
  );

  // 参加者。「全員」モードと「個別」モードの2状態。
  //  - "all"    = 全員参加（送信時は participant_member_ids を一切送らない）
  //  - "custom" = 部分集合（選んだメンバーIDだけ hidden input で送る）
  // 編集モードで既存参加者が居れば最初から custom 開始。
  const initialCustom = isEdit && (ev?.participantMemberIds.length ?? 0) > 0;
  const [pMode, setPMode] = useState<"all" | "custom">(
    initialCustom ? "custom" : "all",
  );
  const [pSelected, setPSelected] = useState<Set<string>>(() => {
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
    if (state.ok) onDone();
  }, [state.ok, onDone]);

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
  const [sDate, setSDate] = useState(startInit.date || "2026-01-01");
  const [sTime, setSTime] = useState(startInit.time || "09:00");
  const initEMin =
    isEdit && endInit.date
      ? dtToMin(endInit.date, endInit.time || "00:00")
      : formMode.mode === "create" && formMode.endTime
        ? dtToMin(formMode.date, formMode.endTime)
        : initSMin + 60;
  const [eDate, setEDate] = useState(minToDt(initEMin).date);
  const [eTime, setETime] = useState(minToDt(initEMin).time);

  // 時差移動の到着の既定（新規時）。通常イベントと同様、出発の1時間後。
  // 出発フィールドは uncontrolled なので初期値だけ合わせる（"とりあえず"の既定）。
  const transitArriveInit = minToDt(initSMin + 60);

  // 時差移動 / 終日の日付は DatePopover（カスタム）に置換したので、フォーム送信用に
  // それぞれ controlled state を持つ。日付追従ロジックは入れない（"とりあえず"の既定）。
  const [departDate, setDepartDate] = useState(startInit.date);
  const [arriveDate, setArriveDate] = useState(
    endInit.date || transitArriveInit.date,
  );
  const [alldayStart, setAlldayStart] = useState(startInit.date);
  const [alldayEnd, setAlldayEnd] = useState(endInit.date || startInit.date);

  // timed の終了日は既定で隠す（同日前提）。日をまたぐ時だけ「期間」トグルで
  // 終了日ピッカーを開く（multiDay）。初期表示で展開するのは「終了日が開始日と
  // 違い、かつ単純な日跨ぎ（＝翌日 かつ 終了時刻 < 開始時刻）ではない」とき
  // ＝本当に複数日にわたる予定の編集時だけ。23:00→翌01:00 のような日跨ぎは
  // 折りたたんだまま終了時刻の隣に「+1日」を出す。
  const initialMultiDay =
    isEdit &&
    eDate !== sDate &&
    !(
      eDate === addOneDay(sDate) &&
      timeToMin(eTime) < timeToMin(sTime)
    );
  const [multiDay, setMultiDay] = useState(initialMultiDay);

  // 折りたたみ時：終了時刻 < 開始時刻なら「翌日に終了」とみなす（日跨ぎ）。
  const wrapped = !multiDay && timeToMin(eTime) < timeToMin(sTime);
  // 送信する終了日：展開時は明示の eDate、折りたたみ時は開始日（日跨ぎなら翌日）。
  const submitEndDate = multiDay ? eDate : wrapped ? addOneDay(sDate) : sDate;

  const onStartDate = (nd: string) => {
    setSDate(nd);
    // 展開時に開始が終了を追い越したら終了日を開始日に揃える
    if (multiDay && nd > eDate) setEDate(nd);
  };
  const onStartTime = (nt: string) => {
    if (multiDay) {
      setSTime(nt);
      return;
    }
    // 折りたたみ時は長さ（壁時計の差・日跨ぎ込み）を保って終了時刻が追従。
    const dur = (timeToMin(eTime) - timeToMin(sTime) + 1440) % 1440;
    setSTime(nt);
    setETime(formatMinutes((timeToMin(nt) + dur) % 1440));
  };
  const onEndTime = (nt: string) => setETime(nt);
  const onEndDate = (nd: string) => setEDate(nd);

  const toggleMultiDay = () => {
    if (multiDay) {
      setMultiDay(false);
    } else {
      // 現在の折りたたみ終了日（同日 or 翌日）を引き継いで終了日ピッカーを開く
      setEDate(wrapped ? addOneDay(sDate) : sDate);
      setMultiDay(true);
    }
  };

  // allday の開始ガード。終了 picker は開始より前を disable しているので
  // 「終了 → 開始」方向の逆転は picker で防止済み。逆方向（開始を終了より
  // 後にする）が来た場合は単日扱いで end も開始日に揃える。
  const setAlldayStartG = (v: string) => {
    setAlldayStart(v);
    if (v > alldayEnd) setAlldayEnd(v);
  };

  const canChangeVis = isEdit ? formMode.canChangeVisibility : true;

  const onDelete = async () => {
    if (!ev) return;
    if (!(await confirmDialog({ title: "この予定を削除しますか？" }))) return;
    startDelete(async () => {
      const { error } = await deleteEventAction(tripId, ev.id);
      if (error) {
        toast(`削除に失敗しました: ${error}`);
        return;
      }
      onDone();
    });
  };

  // 種別 → サーバ契約（kind / all_day）への写像。hidden で送る。
  const submitKind = kind3 === "transit" ? "transit" : "normal";

  return (
    <form
      action={formAction}
      className="relative space-y-3 rounded-md border border-foreground/10 bg-white p-4"
    >
      {/* × は専用行を作らず右上角に重ねる（縦を 1 行ぶん詰める）。先頭の種別トラックが
          下に潜らないよう、トラック側に右クリアランス（mr）を入れる。 */}
      <CloseButton onClick={onDone} className="absolute right-2 top-2 z-10" />

      <input type="hidden" name="kind" value={submitKind} />
      {kind3 === "allday" && (
        <input type="hidden" name="all_day" value="on" />
      )}
      {isEdit && <input type="hidden" name="event_id" value={ev!.id} />}

      {/* 種別の切り替え（通常／終日／タイムゾーン跨ぎ）。
          sr-only の native radio group ＋装飾ラベル（新規/コピーと同じ 1b パターン）。 */}
      <div className="mr-7 flex gap-1 rounded-md border border-foreground/10 p-1">
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
          フライトなど、出発と到着でタイムゾーンが変わる予定。
        </p>
      )}

      <label className="block text-sm">
        <FieldLabel required>タイトル</FieldLabel>
        <Input
          type="text"
          name="title"
          required
          defaultValue={ev?.title ?? ""}
          placeholder={
            kind3 === "transit" ? "NRT-HNL" : "ハイキング"
          }
          className={inputLayout}
        />
      </label>

      <div className="block text-sm">
        <FieldLabel>場所</FieldLabel>
        {mapsApiKey ? (
          <APIProvider apiKey={mapsApiKey}>
            <PlacePicker
              places={places}
              biasCenter={biasCenter}
              initial={placePickerInitial}
              placeholder={kind3 === "transit" ? "成田国際空港" : "ダイヤモンドヘッド"}
            />
          </APIProvider>
        ) : (
          <PlacePicker
            places={places}
            biasCenter={biasCenter}
            initial={placePickerInitial}
            placeholder={kind3 === "transit" ? "成田国際空港" : "ダイヤモンドヘッド"}
          />
        )}
      </div>

      {/* 日時。3種別とも同じ2列グリッド。差は「右に時刻を入れるか」
          「TZ行が付くか」だけ。 */}
      {kind3 === "transit" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className={fieldCls}>
              <span className="text-muted-foreground">出発日</span>
              <DatePopover
                name="depart_date"
                value={departDate}
                onChange={setDepartDate}
                required
                tripStart={tripStart}
                tripEnd={tripEnd}
              />
            </label>
            <label className={fieldCls}>
              <span className="text-muted-foreground">出発時刻</span>
              <Input
                type="time"
                name="depart_time"
                required
                defaultValue={startInit.time || "09:00"}
                className={inputLayout}
              />
            </label>
            <label className={fieldCls}>
              <span className="text-muted-foreground">到着日</span>
              <DatePopover
                name="arrive_date"
                value={arriveDate}
                onChange={setArriveDate}
                required
                tripStart={tripStart}
                tripEnd={tripEnd}
              />
            </label>
            <label className={fieldCls}>
              <span className="text-muted-foreground">到着時刻</span>
              <Input
                type="time"
                name="arrive_time"
                required
                defaultValue={endInit.time || transitArriveInit.time}
                className={inputLayout}
              />
            </label>
          </div>
          <label className={fieldCls}>
            <span className="text-muted-foreground">出発地タイムゾーン</span>
            <TzSelect name="depart_tz" value={tzInit} />
          </label>
          <label className={fieldCls}>
            <span className="text-muted-foreground">到着地タイムゾーン</span>
            <TzSelect name="arrive_tz" value={endTzInit} />
          </label>
        </div>
      )}

      {kind3 === "allday" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className={fieldCls}>
              <span className="text-muted-foreground">開始日</span>
              <DatePopover
                name="start_date"
                value={alldayStart}
                onChange={setAlldayStartG}
                required
                tripStart={tripStart}
                tripEnd={tripEnd}
              />
            </label>
            <div />
            <label className={fieldCls}>
              <span className="text-muted-foreground">終了日</span>
              <DatePopover
                name="end_date"
                value={alldayEnd}
                onChange={setAlldayEnd}
                required
                tripStart={tripStart}
                tripEnd={tripEnd}
                disabled={
                  parseYmd(alldayStart)
                    ? { before: parseYmd(alldayStart)! }
                    : undefined
                }
              />
            </label>
            <div />
          </div>
          {/* 終日はTZ無関係。サーバ側で UTC 固定にする（tz は送らない） */}
        </div>
      )}

      {kind3 === "timed" && (
        <div className="space-y-3">
          {/* 日付＋開始–終了時刻を 1 行に。終了日は既定で隠し（同日前提）、日をまたぐ時だけ
              右端の「期間」トグルで終了日ピッカーを開く。終了時刻＜開始時刻の日跨ぎは折り
              たたんだまま「+1日」を出す。 */}
          <div>
            <span className="text-sm text-muted-foreground">日時</span>
            <div className="mt-1 flex items-center gap-2">
              <DatePopover
                name="start_date"
                value={sDate}
                onChange={onStartDate}
                required
                compact
                className="w-auto shrink-0"
                tripStart={tripStart}
                tripEnd={tripEnd}
              />
              <Input
                type="time"
                name="start_time"
                required
                value={sTime}
                onChange={(e) => onStartTime(e.target.value)}
                className="w-[4.5rem] shrink-0 px-2"
              />
              <span className="shrink-0 text-muted-foreground">–</span>
              <div className="relative shrink-0">
                <Input
                  type="time"
                  name="end_time"
                  required
                  value={eTime}
                  onChange={(e) => onEndTime(e.target.value)}
                  className="w-[4.5rem] px-2"
                />
                {wrapped && (
                  <span className="pointer-events-none absolute -right-1 -top-2 rounded bg-blue-50 px-1 text-[10px] font-medium text-blue-600">
                    +1日
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                onClick={toggleMultiDay}
                aria-pressed={multiDay}
                aria-label="終了日を別の日にする"
                title="終了日を別の日にする"
                className={`ml-auto shrink-0 ${multiDay ? "bg-accent text-foreground" : "text-muted-foreground"}`}
              >
                <CalendarRangeIcon size={16} />
              </Button>
            </div>
          </div>

          {multiDay ? (
            <label className={fieldCls}>
              <span className="text-muted-foreground">終了日</span>
              <DatePopover
                name="end_date"
                value={eDate}
                onChange={onEndDate}
                required
                tripStart={tripStart}
                tripEnd={tripEnd}
                disabled={
                  parseYmd(sDate) ? { before: parseYmd(sDate)! } : undefined
                }
              />
            </label>
          ) : (
            <input type="hidden" name="end_date" value={submitEndDate} />
          )}

          <label className={fieldCls}>
            <span className="text-muted-foreground">タイムゾーン</span>
            <TzSelect name="tz" value={tzInit} />
          </label>
        </div>
      )}

      <fieldset className="text-xs">
        <legend className="font-medium">公開範囲</legend>
        {canChangeVis ? (
          <div className="mt-1 flex gap-3">
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="visibility"
                value="shared"
                checked={visibility === "shared"}
                onChange={() => setVisibility("shared")}
              />
              <span>共有</span>
            </label>
            <label className="inline-flex items-center gap-1">
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
        ) : (
          <input type="hidden" name="visibility" value={visibility} />
        )}
      </fieldset>

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
            <span>参加者: {pMode === "all" ? "全員" : "一部"}</span>
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

      {/* 要予約。共有予定のみ（private は共有TODOリストに出せない）。 */}
      {visibility === "shared" && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="needs_reservation"
            checked={needsReservation}
            onChange={(e) => setNeedsReservation(e.target.checked)}
          />
          <FieldLabel>要予約</FieldLabel>
        </label>
      )}

      <label className="block text-sm">
        <FieldLabel>メモ</FieldLabel>
        <Input
          type="text"
          name="note"
          defaultValue={ev?.note ?? ""}
          placeholder={
            kind3 === "transit" ? "ターミナル1" : "日焼け止め持参"
          }
          className={inputLayout}
        />
      </label>

      <div className="flex gap-2">
        {isEdit && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={onDelete}
            disabled={isDeleting}
            aria-label="削除"
            title="削除"
            className="shrink-0"
          >
            <TrashIcon size={18} />
          </Button>
        )}
        <Button
          type="submit"
          disabled={isPending}
          aria-label={isEdit ? "保存" : "追加"}
          title={isEdit ? "保存" : "追加"}
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
