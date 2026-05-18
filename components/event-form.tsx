"use client";

import { useActionState, useEffect, useState, useTransition } from "react";

import { APIProvider } from "@vis.gl/react-google-maps";

import {
  createEventAction,
  deleteEventAction,
  type EventMutationState,
  updateEventAction,
} from "@/app/trips/[tripId]/actions";
import type { LatLng } from "@/lib/placeMap";
import type { ScheduleEvent } from "@/lib/schedule";
import type { Visibility } from "@/lib/types/database";

import { PlaceAutocomplete, type PickedPlace } from "./place-autocomplete";

type PlaceMode = "saved" | "google" | "free";

const PLACE_MODE_LABEL: Record<PlaceMode, string> = {
  saved: "保存済み",
  google: "Google検索",
  free: "自由入力",
};

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

const inputCls =
  "mt-1 block w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-black focus:outline-none";

// グリッド内のフィールド枠。min-w-0 が無いと date/time の実寸でセルが
// 広がり、ポップオーバーから input がはみ出す。
const fieldCls = "block min-w-0 text-xs";

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
  const time = `${String(Math.floor(rem / 60)).padStart(2, "0")}:${String(
    rem % 60,
  ).padStart(2, "0")}`;
  return { date, time };
}

export type EventFormMode =
  | { mode: "create"; date: string; time: string; tz: string }
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

function initialKind3(ev: ScheduleEvent | null): Kind3 {
  if (!ev) return "timed";
  if (ev.kind === "transit") return "transit";
  if (ev.allDay) return "allday";
  return "timed";
}

export function EventForm({
  tripId,
  defaultTz,
  state: formMode,
  places,
  biasCenter,
  onDone,
}: {
  tripId: string;
  defaultTz: string; // 個別TZの初期値（= 前回入力 or ブラウザTZ）
  state: EventFormMode;
  places: { id: string; name: string }[];
  biasCenter: LatLng; // Google 検索の地理バイアス（既存ピンの重心 or 東京）
  onDone: () => void;
}) {
  const isEdit = formMode.mode === "edit";
  const ev = isEdit ? formMode.event : null;
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // 場所欄の3モード。編集時は既存値からモードを推定（place_id→保存済み、
  // place_label→自由入力、どちらも無し→保存済みの「なし」）。
  const [placeMode, setPlaceMode] = useState<PlaceMode>(
    ev?.placeId ? "saved" : ev?.placeLabel ? "free" : "saved",
  );
  const [picked, setPicked] = useState<PickedPlace | null>(null);
  const [freeLabel, setFreeLabel] = useState(ev?.placeLabel ?? "");

  const action = isEdit
    ? updateEventAction.bind(null, tripId)
    : createEventAction.bind(null, tripId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  const [kind3, setKind3] = useState<Kind3>(initialKind3(ev));
  const [visibility, setVisibility] = useState<Visibility>(
    isEdit ? ev!.visibility : "shared",
  );

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
      : initSMin + 60;
  const [eDate, setEDate] = useState(minToDt(initEMin).date);
  const [eTime, setETime] = useState(minToDt(initEMin).time);

  const moveStart = (nd: string, nt: string) => {
    const dur = Math.max(dtToMin(eDate, eTime) - dtToMin(sDate, sTime), 60);
    setSDate(nd);
    setSTime(nt);
    const ne = minToDt(dtToMin(nd, nt) + dur);
    setEDate(ne.date);
    setETime(ne.time);
  };

  const canChangeVis = isEdit ? formMode.canChangeVisibility : true;

  const onDelete = () => {
    if (!ev) return;
    if (!confirm("この予定を削除しますか？")) return;
    startDelete(async () => {
      const { error } = await deleteEventAction(tripId, ev.id);
      if (error) {
        alert(`削除に失敗しました: ${error}`);
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
      className="space-y-3 rounded-md border border-zinc-200 bg-white p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {isEdit ? "予定を編集" : "予定を追加"}
        </h3>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          閉じる
        </button>
      </div>

      <input type="hidden" name="kind" value={submitKind} />
      {kind3 === "allday" && (
        <input type="hidden" name="all_day" value="on" />
      )}
      {isEdit && <input type="hidden" name="event_id" value={ev!.id} />}

      {/* 種別セレクタ（通常／終日／タイムゾーン跨ぎ） */}
      <div className="flex gap-1 rounded-md border border-zinc-200 p-1">
        {(["timed", "allday", "transit"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind3(k)}
            className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition ${
              kind3 === k
                ? "bg-black text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {KIND3_LABEL[k]}
          </button>
        ))}
      </div>
      {kind3 === "transit" && (
        <p className="-mt-1 text-[11px] text-zinc-500">
          フライトなど、出発と到着でタイムゾーンが変わる予定。
        </p>
      )}

      <label className="block text-sm">
        <span className="font-medium">タイトル</span>
        <input
          type="text"
          name="title"
          required
          defaultValue={ev?.title ?? ""}
          placeholder={
            kind3 === "transit" ? "NRT-HNL ZG002" : "ハイキング"
          }
          className={inputCls}
        />
      </label>

      <div className="block text-sm">
        <span className="font-medium">場所（任意）</span>

        <input type="hidden" name="place_mode" value={placeMode} />

        <div className="mt-1 flex gap-1 rounded-md border border-zinc-200 p-1">
          {(["saved", "google", "free"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPlaceMode(m)}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
                placeMode === m
                  ? "bg-black text-white"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {PLACE_MODE_LABEL[m]}
            </button>
          ))}
        </div>

        {/* 保存済みから選ぶ（従来 UX） */}
        {placeMode === "saved" && (
          <select
            name="place_id"
            defaultValue={ev?.placeId ?? ""}
            className={`${inputCls} mt-2`}
          >
            <option value="">なし</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {/* Google から検索して選ぶ → 確定で「場所」にも追加され紐づく */}
        {placeMode === "google" && (
          <div className="mt-2">
            {picked ? (
              <div className="flex items-start justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {picked.name}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {picked.address}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="shrink-0 text-xs text-zinc-500 hover:text-zinc-900"
                >
                  選び直す
                </button>
              </div>
            ) : mapsApiKey ? (
              <APIProvider apiKey={mapsApiKey}>
                <PlaceAutocomplete
                  biasCenter={biasCenter}
                  onPick={setPicked}
                />
              </APIProvider>
            ) : (
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                Google Maps API キーが未設定のため検索は使えません。
              </p>
            )}
            <p className="mt-1 text-[11px] text-zinc-500">
              選ぶと「場所」にも確定ステータスで追加されます。
            </p>
            {picked && (
              <>
                <input
                  type="hidden"
                  name="g_place_id"
                  value={picked.placeId}
                />
                <input type="hidden" name="g_name" value={picked.name} />
                <input
                  type="hidden"
                  name="g_address"
                  value={picked.address}
                />
                <input type="hidden" name="g_lat" value={picked.lat} />
                <input type="hidden" name="g_lng" value={picked.lng} />
              </>
            )}
          </div>
        )}

        {/* 完全フリーテキスト → places は作らず place_label に保持 */}
        {placeMode === "free" && (
          <input
            type="text"
            name="place_label"
            value={freeLabel}
            onChange={(e) => setFreeLabel(e.target.value)}
            placeholder="例: 集合場所のロビー"
            className={`${inputCls} mt-2`}
          />
        )}
      </div>

      {/* 日時。3種別とも同じ2列グリッド。差は「右に時刻を入れるか」
          「TZ行が付くか」だけ。 */}
      {kind3 === "transit" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className={fieldCls}>
              <span className="text-zinc-600">出発日</span>
              <input
                type="date"
                name="depart_date"
                required
                defaultValue={startInit.date}
                className={inputCls}
              />
            </label>
            <label className={fieldCls}>
              <span className="text-zinc-600">出発時刻</span>
              <input
                type="time"
                name="depart_time"
                required
                defaultValue={startInit.time || "09:00"}
                className={inputCls}
              />
            </label>
            <label className={fieldCls}>
              <span className="text-zinc-600">到着日</span>
              <input
                type="date"
                name="arrive_date"
                required
                defaultValue={endInit.date || startInit.date}
                className={inputCls}
              />
            </label>
            <label className={fieldCls}>
              <span className="text-zinc-600">到着時刻</span>
              <input
                type="time"
                name="arrive_time"
                required
                defaultValue={endInit.time}
                className={inputCls}
              />
            </label>
          </div>
          <label className={fieldCls}>
            <span className="text-zinc-600">出発地タイムゾーン</span>
            <TzSelect name="depart_tz" value={tzInit} />
          </label>
          <label className={fieldCls}>
            <span className="text-zinc-600">到着地タイムゾーン</span>
            <TzSelect name="arrive_tz" value={endTzInit} />
          </label>
        </div>
      )}

      {kind3 === "allday" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className={fieldCls}>
              <span className="text-zinc-600">開始日</span>
              <input
                type="date"
                name="start_date"
                required
                defaultValue={startInit.date}
                className={inputCls}
              />
            </label>
            <div />
            <label className={fieldCls}>
              <span className="text-zinc-600">終了日</span>
              <input
                type="date"
                name="end_date"
                required
                defaultValue={endInit.date || startInit.date}
                className={inputCls}
              />
            </label>
            <div />
          </div>
          {/* 終日はTZ無関係。サーバ側で UTC 固定にする（tz は送らない） */}
        </div>
      )}

      {kind3 === "timed" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className={fieldCls}>
              <span className="text-zinc-600">開始日</span>
              <input
                type="date"
                name="start_date"
                required
                value={sDate}
                onChange={(e) => moveStart(e.target.value, sTime)}
                className={inputCls}
              />
            </label>
            <label className={fieldCls}>
              <span className="text-zinc-600">開始時刻</span>
              <input
                type="time"
                name="start_time"
                required
                value={sTime}
                onChange={(e) => moveStart(sDate, e.target.value)}
                className={inputCls}
              />
            </label>
            <label className={fieldCls}>
              <span className="text-zinc-600">終了日</span>
              <input
                type="date"
                name="end_date"
                required
                value={eDate}
                onChange={(e) => setEDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className={fieldCls}>
              <span className="text-zinc-600">終了時刻</span>
              <input
                type="time"
                name="end_time"
                required
                value={eTime}
                onChange={(e) => setETime(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
          <label className={fieldCls}>
            <span className="text-zinc-600">タイムゾーン</span>
            <TzSelect name="tz" value={tzInit} />
          </label>
        </div>
      )}

      <fieldset className="text-xs">
        <legend className="font-medium text-zinc-700">公開範囲</legend>
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

      <label className="block text-sm">
        <span className="font-medium">メモ（任意）</span>
        <input
          type="text"
          name="note"
          defaultValue={ev?.note ?? ""}
          placeholder="座席、予約番号、集合場所、など"
          className={inputCls}
        />
      </label>

      <div className="flex gap-2">
        {isEdit && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            {isDeleting ? "削除中..." : "削除"}
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="h-9 flex-1 rounded-md bg-black text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? "保存中..." : isEdit ? "保存" : "追加"}
        </button>
      </div>

      {state.error && (
        <p className="rounded bg-red-50 p-2 text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
