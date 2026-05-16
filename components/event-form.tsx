"use client";

import { useActionState, useEffect, useState, useTransition } from "react";

import {
  createEventAction,
  deleteEventAction,
  type EventMutationState,
  updateEventAction,
} from "@/app/trips/[tripId]/actions";
import type { ScheduleEvent } from "@/lib/schedule";
import type { Visibility } from "@/lib/types/database";

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
  "mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-black focus:outline-none";

export type EventFormMode =
  | {
      mode: "create";
      kind: "normal" | "transit";
      date: string; // YYYY-MM-DD
      time: string; // HH:MM
      tz: string;
    }
  | { mode: "edit"; event: ScheduleEvent; canChangeVisibility: boolean };

function TzSelect({
  name,
  defaultValue,
  tripTz,
}: {
  name: string;
  defaultValue: string;
  tripTz: string;
}) {
  const opts = [...TIMEZONE_OPTIONS];
  if (!opts.some((o) => o.value === tripTz)) {
    opts.unshift({ value: tripTz, label: `${tripTz}（旅行の既定）` });
  }
  return (
    <select name={name} defaultValue={defaultValue} className={inputCls}>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function EventForm({
  tripId,
  tripTz,
  state: formMode,
  places,
  onDone,
}: {
  tripId: string;
  tripTz: string;
  state: EventFormMode;
  places: { id: string; name: string }[];
  onDone: () => void;
}) {
  const isEdit = formMode.mode === "edit";
  const ev = isEdit ? formMode.event : null;

  const action = isEdit
    ? updateEventAction.bind(null, tripId)
    : createEventAction.bind(null, tripId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  const initialKind = isEdit ? ev!.kind : formMode.kind;
  const [kind] = useState<"normal" | "transit">(initialKind);
  const [allDay, setAllDay] = useState(isEdit ? ev!.allDay : false);
  const [visibility, setVisibility] = useState<Visibility>(
    isEdit ? ev!.visibility : "shared",
  );

  const [isDeleting, startDelete] = useTransition();

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  // 初期値（壁時計文字列を date / time に割る）
  const splitWall = (s: string | null) => {
    if (!s) return { date: "", time: "" };
    return { date: s.slice(0, 10), time: s.slice(11, 16) };
  };
  const startInit = isEdit
    ? splitWall(ev!.startAt)
    : { date: formMode.date, time: formMode.time };
  const endInit = isEdit ? splitWall(ev!.endAt) : { date: "", time: "" };
  const tzInit = isEdit ? ev!.startTz : formMode.tz;
  const endTzInit = isEdit ? (ev!.endTz ?? tripTz) : tripTz;

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

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-md border border-zinc-200 bg-white p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {isEdit ? "予定を編集" : kind === "transit" ? "フライトを追加" : "予定を追加"}
        </h3>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          閉じる
        </button>
      </div>

      <input type="hidden" name="kind" value={kind} />
      {isEdit && <input type="hidden" name="event_id" value={ev!.id} />}

      <label className="block text-sm">
        <span className="font-medium">タイトル</span>
        <input
          type="text"
          name="title"
          required
          defaultValue={ev?.title ?? ""}
          placeholder={kind === "transit" ? "NRT-HNL ZG002" : "ハイキング"}
          className={inputCls}
        />
      </label>

      {kind === "transit" ? (
        <div className="space-y-3">
          <fieldset className="rounded-md border border-zinc-200 p-3">
            <legend className="px-1 text-xs font-medium text-zinc-600">
              出発
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">
                <span className="text-zinc-600">日付</span>
                <input
                  type="date"
                  name="depart_date"
                  required
                  defaultValue={startInit.date}
                  className={inputCls}
                />
              </label>
              <label className="block text-xs">
                <span className="text-zinc-600">時刻</span>
                <input
                  type="time"
                  name="depart_time"
                  required
                  defaultValue={startInit.time || "09:00"}
                  className={inputCls}
                />
              </label>
            </div>
            <label className="mt-2 block text-xs">
              <span className="text-zinc-600">出発地タイムゾーン</span>
              <TzSelect
                name="depart_tz"
                defaultValue={tzInit}
                tripTz={tripTz}
              />
            </label>
          </fieldset>

          <fieldset className="rounded-md border border-zinc-200 p-3">
            <legend className="px-1 text-xs font-medium text-zinc-600">
              到着
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">
                <span className="text-zinc-600">日付</span>
                <input
                  type="date"
                  name="arrive_date"
                  required
                  defaultValue={endInit.date}
                  className={inputCls}
                />
              </label>
              <label className="block text-xs">
                <span className="text-zinc-600">時刻</span>
                <input
                  type="time"
                  name="arrive_time"
                  required
                  defaultValue={endInit.time}
                  className={inputCls}
                />
              </label>
            </div>
            <label className="mt-2 block text-xs">
              <span className="text-zinc-600">到着地タイムゾーン</span>
              <TzSelect
                name="arrive_tz"
                defaultValue={endTzInit}
                tripTz={tripTz}
              />
            </label>
          </fieldset>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="all_day"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            <span>終日 / 連日</span>
          </label>

          {allDay ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">
                <span className="text-zinc-600">開始日</span>
                <input
                  type="date"
                  name="start_date"
                  required
                  defaultValue={startInit.date}
                  className={inputCls}
                />
              </label>
              <label className="block text-xs">
                <span className="text-zinc-600">終了日</span>
                <input
                  type="date"
                  name="end_date"
                  defaultValue={endInit.date || startInit.date}
                  className={inputCls}
                />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-xs">
                <span className="text-zinc-600">日付</span>
                <input
                  type="date"
                  name="start_date"
                  required
                  defaultValue={startInit.date}
                  className={inputCls}
                />
              </label>
              <label className="block text-xs">
                <span className="text-zinc-600">開始</span>
                <input
                  type="time"
                  name="start_time"
                  required
                  defaultValue={startInit.time || "09:00"}
                  className={inputCls}
                />
              </label>
              <label className="block text-xs">
                <span className="text-zinc-600">終了（任意）</span>
                <input
                  type="time"
                  name="end_time"
                  defaultValue={endInit.time}
                  className={inputCls}
                />
              </label>
            </div>
          )}

          <label className="block text-xs">
            <span className="text-zinc-600">タイムゾーン</span>
            <TzSelect name="tz" defaultValue={tzInit} tripTz={tripTz} />
          </label>
        </div>
      )}

      <label className="block text-sm">
        <span className="font-medium">場所（任意）</span>
        <select
          name="place_id"
          defaultValue={ev?.placeId ?? ""}
          className={inputCls}
        >
          <option value="">なし</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

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
