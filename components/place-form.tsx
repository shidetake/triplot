"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { useMapsLibrary } from "@vis.gl/react-google-maps";

import {
  createPlaceAction,
  type CreatePlaceState,
} from "@/app/trips/[tripId]/actions";

export type PlaceStatus = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
};

const initialState: CreatePlaceState = { ok: false, error: null };

export function PlaceForm({
  tripId,
  statuses,
}: {
  tripId: string;
  statuses: PlaceStatus[];
}) {
  const boundAction = createPlaceAction.bind(null, tripId);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    initialState,
  );

  const sortedStatuses = [...statuses].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  // status / visibility は controlled。連続入力で前回値を保持（reset しない）。
  const [statusId, setStatusId] = useState(sortedStatuses[0]?.id ?? "");
  const [visibility, setVisibility] = useState<"shared" | "private">("shared");

  // name と Google 由来の隠しフィールドは uncontrolled。
  // 成功時は form.reset() で空に戻す（expense-form と同じ方式。effect 内 setState を避ける）。
  const placesLib = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const placeIdRef = useRef<HTMLInputElement>(null);
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const noteId = useId();

  const clearGoogleFields = () => {
    if (placeIdRef.current) placeIdRef.current.value = "";
    if (latRef.current) latRef.current.value = "";
    if (lngRef.current) lngRef.current.value = "";
  };

  // Google Places Autocomplete を name 入力にバインド。
  // 選択時に place_id / 座標 / 正式名を埋める。手入力時は onChange で外す。
  useEffect(() => {
    if (!placesLib || !inputRef.current) return;
    const ac = new placesLib.Autocomplete(inputRef.current, {
      fields: ["place_id", "name", "geometry"],
    });
    const listener = ac.addListener("place_changed", () => {
      const p = ac.getPlace();
      if (inputRef.current && p.name) inputRef.current.value = p.name;
      if (placeIdRef.current) placeIdRef.current.value = p.place_id ?? "";
      const loc = p.geometry?.location;
      if (latRef.current) latRef.current.value = loc ? String(loc.lat()) : "";
      if (lngRef.current) lngRef.current.value = loc ? String(loc.lng()) : "";
    });
    return () => listener.remove();
  }, [placesLib]);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      // statusId / visibility は controlled かつ意図的に保持（reset 対象外）
    }
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-md border border-zinc-200 bg-white p-4"
    >
      <label className="block text-sm">
        <span className="font-medium">場所</span>
        <input
          ref={inputRef}
          type="text"
          name="name"
          required
          defaultValue=""
          onChange={clearGoogleFields}
          placeholder={placesLib ? "店名・地名で検索" : "地図を読み込み中..."}
          autoComplete="off"
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        />
      </label>
      <input
        ref={placeIdRef}
        type="hidden"
        name="google_place_id"
        defaultValue=""
      />
      <input ref={latRef} type="hidden" name="lat" defaultValue="" />
      <input ref={lngRef} type="hidden" name="lng" defaultValue="" />

      <label className="block text-sm">
        <span className="font-medium">ステータス</span>
        <select
          name="status_id"
          required
          value={statusId}
          onChange={(e) => setStatusId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        >
          {sortedStatuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm" htmlFor={noteId}>
        <span className="font-medium">メモ（任意）</span>
        <input
          id={noteId}
          type="text"
          name="note"
          placeholder="営業時間、予約要、など"
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        />
      </label>

      <fieldset className="text-sm">
        <legend className="font-medium">公開範囲</legend>
        <div className="mt-1 flex gap-4">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="visibility"
              value="shared"
              checked={visibility === "shared"}
              onChange={() => setVisibility("shared")}
            />
            <span>共有（メンバーに見える）</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="visibility"
              value="private"
              checked={visibility === "private"}
              onChange={() => setVisibility("private")}
            />
            <span>プライベート（自分のみ）</span>
          </label>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={isPending}
        className="h-10 w-full rounded-md bg-black font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
      >
        {isPending ? "追加中..." : "場所を追加"}
      </button>

      {state.error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
