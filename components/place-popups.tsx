"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";

import {
  createPlaceAction,
  deletePlaceAction,
  type PlaceMutationState,
  updatePlaceAction,
} from "@/app/trips/[tripId]/actions";
import type { Visibility } from "@/lib/types/database";

import { gmapsUrl, type PlaceRow, type PlaceStatus } from "./place-list";
import type { CandidatePlace } from "./place-search";

const initialState: PlaceMutationState = { ok: false, error: null };

function StatusSelect({
  statuses,
  value,
  onChange,
}: {
  statuses: PlaceStatus[];
  value: string;
  onChange: (v: string) => void;
}) {
  const sorted = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <label className="block text-xs">
      <span className="font-medium text-zinc-700">ステータス</span>
      <select
        name="status_id"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-black focus:outline-none"
      >
        {sorted.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function VisibilityField({
  value,
  onChange,
  editable,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
  editable: boolean;
}) {
  if (!editable) {
    // 非作成者は shared 場所の公開範囲を変えられない（RPC と同条件）。
    return <input type="hidden" name="visibility" value={value} />;
  }
  return (
    <fieldset className="text-xs">
      <legend className="font-medium text-zinc-700">公開範囲</legend>
      <div className="mt-1 flex gap-3">
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            name="visibility"
            value="shared"
            checked={value === "shared"}
            onChange={() => onChange("shared")}
          />
          <span>共有</span>
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            name="visibility"
            value="private"
            checked={value === "private"}
            onChange={() => onChange("private")}
          />
          <span>自分のみ</span>
        </label>
      </div>
    </fieldset>
  );
}

export function CandidateInfo({
  tripId,
  candidate,
  statuses,
  onAdded,
}: {
  tripId: string;
  candidate: CandidatePlace;
  statuses: PlaceStatus[];
  onAdded: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    createPlaceAction.bind(null, tripId),
    initialState,
  );
  const sorted = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  const [statusId, setStatusId] = useState(sorted[0]?.id ?? "");
  const [visibility, setVisibility] = useState<Visibility>("shared");
  const noteId = useId();

  useEffect(() => {
    if (state.ok) onAdded();
  }, [state.ok, onAdded]);

  return (
    <div className="flex max-h-[26rem] w-64 flex-col gap-2 overflow-y-auto pr-1">
      {candidate.photoUri && (
        // 吹き出しを開いた時だけ <img> が読まれる → Photo 課金は開いた分のみ。
        // Google 写真 CDN は動的ドメインで next/image の最適化対象外なので素の img。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={candidate.photoUri}
          alt={candidate.name}
          className="h-24 w-full shrink-0 rounded object-cover"
        />
      )}
      <div>
        <p className="text-sm font-semibold">{candidate.name}</p>
        {candidate.rating != null && (
          <p className="text-xs text-amber-600">
            ★ {candidate.rating.toFixed(1)}
            {candidate.userRatingCount != null && (
              <span className="text-zinc-500">
                {" "}
                ({candidate.userRatingCount})
              </span>
            )}
          </p>
        )}
        <p className="mt-0.5 text-xs text-zinc-600">{candidate.address}</p>
      </div>

      <form action={formAction} className="space-y-2 border-t border-zinc-200 pt-2">
        <input type="hidden" name="name" value={candidate.name} />
        <input
          type="hidden"
          name="google_place_id"
          value={candidate.placeId}
        />
        <input type="hidden" name="lat" value={candidate.lat} />
        <input type="hidden" name="lng" value={candidate.lng} />
        <input
          type="hidden"
          name="formatted_address"
          value={candidate.address}
        />

        <StatusSelect
          statuses={statuses}
          value={statusId}
          onChange={setStatusId}
        />
        <VisibilityField
          value={visibility}
          onChange={setVisibility}
          editable
        />
        <label className="block text-xs" htmlFor={noteId}>
          <span className="font-medium text-zinc-700">メモ（任意）</span>
          <input
            id={noteId}
            type="text"
            name="note"
            placeholder="営業時間、予約要、など"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-black focus:outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="h-9 w-full rounded-md bg-black text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? "追加中..." : "この場所を追加"}
        </button>
        {state.error && (
          <p className="rounded bg-red-50 p-2 text-xs text-red-700">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}

export function SavedInfo({
  tripId,
  place,
  statuses,
  canEdit,
  canDelete,
  canChangeVisibility,
  onDone,
}: {
  tripId: string;
  place: PlaceRow;
  statuses: PlaceStatus[];
  canEdit: boolean;
  canDelete: boolean;
  canChangeVisibility: boolean;
  onDone: () => void;
}) {
  const status = statuses.find((s) => s.id === place.status_id);
  const [editing, setEditing] = useState(false);

  const [state, formAction, isPending] = useActionState(
    updatePlaceAction.bind(null, tripId),
    initialState,
  );
  const [statusId, setStatusId] = useState(place.status_id);
  const [visibility, setVisibility] = useState<Visibility>(place.visibility);
  const noteId = useId();

  const [isDeleting, startDelete] = useTransition();

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const onDelete = () => {
    if (!confirm("この場所を削除しますか？")) return;
    startDelete(async () => {
      const { error } = await deletePlaceAction(tripId, place.id);
      if (error) {
        alert(`削除に失敗しました: ${error}`);
        return;
      }
      onDone();
    });
  };

  return (
    <div className="flex max-h-[26rem] w-64 flex-col gap-2 overflow-y-auto pr-1">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {status && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: status.color }}
            >
              {status.name}
            </span>
          )}
          {place.visibility === "private" && (
            <span className="rounded bg-zinc-100 px-1.5 text-xs text-zinc-600">
              プライベート
            </span>
          )}
        </div>
        <p className="mt-1 text-sm font-semibold">{place.name}</p>
        <p className="mt-0.5 text-xs text-zinc-600">
          {place.formatted_address}
        </p>
        {!editing && place.note && (
          <p className="mt-1 text-xs text-zinc-700">{place.note}</p>
        )}
        <a
          href={gmapsUrl(place)}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-xs text-blue-600 hover:underline"
        >
          Googleマップで開く
        </a>
      </div>

      {editing ? (
        <form
          action={formAction}
          className="space-y-2 border-t border-zinc-200 pt-2"
        >
          <input type="hidden" name="place_id" value={place.id} />
          <StatusSelect
            statuses={statuses}
            value={statusId}
            onChange={setStatusId}
          />
          <VisibilityField
            value={visibility}
            onChange={setVisibility}
            editable={canChangeVisibility}
          />
          <label className="block text-xs" htmlFor={noteId}>
            <span className="font-medium text-zinc-700">メモ</span>
            <input
              id={noteId}
              type="text"
              name="note"
              defaultValue={place.note ?? ""}
              placeholder="営業時間、予約要、など"
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-black focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-9 flex-1 rounded-md border border-zinc-300 text-sm font-medium transition hover:bg-zinc-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="h-9 flex-1 rounded-md bg-black text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {isPending ? "保存中..." : "保存"}
            </button>
          </div>
          {state.error && (
            <p className="rounded bg-red-50 p-2 text-xs text-red-700">
              {state.error}
            </p>
          )}
        </form>
      ) : (
        (canEdit || canDelete) && (
          <div className="flex gap-2 border-t border-zinc-200 pt-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="h-9 flex-1 rounded-md border border-zinc-300 text-sm font-medium transition hover:bg-zinc-50"
              >
                編集
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                className="h-9 flex-1 rounded-md border border-red-200 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                {isDeleting ? "削除中..." : "削除"}
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
