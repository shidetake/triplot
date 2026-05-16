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

  // 新 Places API（PlaceAutocompleteElement）。レガシー Autocomplete は非推奨のため
  // こちらを使う。選択結果は hidden input に詰めて server action へ送る。
  const placesLib = useMapsLibrary("places");
  const acContainerRef = useRef<HTMLDivElement>(null);
  const acElementRef =
    useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const placeIdRef = useRef<HTMLInputElement>(null);
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const noteId = useId();

  useEffect(() => {
    if (!placesLib || !acContainerRef.current) return;

    const el = new google.maps.places.PlaceAutocompleteElement({});
    el.placeholder = "店名・地名で検索";
    el.requestedLanguage = "ja";
    el.requestedRegion = "jp";
    el.style.width = "100%";
    acElementRef.current = el;
    acContainerRef.current.appendChild(el);

    const controller = new AbortController();
    el.addEventListener(
      "gmp-select",
      (event: google.maps.places.PlacePredictionSelectEvent) => {
        // fetchFields は非同期。listener 自体は同期にして promise を投げっぱなしにする
        // （async listener は no-misused-promises に触れるため）。
        void (async () => {
          const place = event.placePrediction.toPlace();
          await place.fetchFields({
            fields: ["id", "displayName", "location"],
          });
          if (nameRef.current) {
            nameRef.current.value = place.displayName ?? "";
          }
          if (placeIdRef.current) {
            placeIdRef.current.value = place.id ?? "";
          }
          const loc = place.location;
          if (latRef.current) {
            latRef.current.value = loc ? String(loc.lat()) : "";
          }
          if (lngRef.current) {
            lngRef.current.value = loc ? String(loc.lng()) : "";
          }
        })();
      },
      { signal: controller.signal },
    );

    return () => {
      controller.abort();
      el.remove();
      acElementRef.current = null;
    };
  }, [placesLib]);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset(); // hidden input を "" に戻す
      if (acElementRef.current) acElementRef.current.value = "";
      // statusId / visibility は controlled かつ意図的に保持（reset 対象外）
    }
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-md border border-zinc-200 bg-white p-4"
    >
      <div className="text-sm">
        <span className="font-medium">場所</span>
        <div ref={acContainerRef} className="mt-1" />
        <p className="mt-1 text-xs text-zinc-500">
          {placesLib
            ? "Google マップから検索して選択してください"
            : "地図を読み込み中..."}
        </p>
      </div>
      <input ref={nameRef} type="hidden" name="name" defaultValue="" />
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
