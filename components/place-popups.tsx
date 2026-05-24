"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";

import {
  createPlaceAction,
  deletePlaceAction,
  type PlaceMutationState,
  setPlaceLocationAction,
  updatePlaceAction,
} from "@/app/trips/[tripId]/actions";
import type { Visibility } from "@/lib/types/database";

import { TrashIcon, CloseIcon } from "./icons";
import {
  gmapsUrl,
  PLACE_ICONS,
  PlaceIcon,
  type PlaceRow,
  type PlaceStatus,
} from "./place-list";
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

function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="text-xs">
      <legend className="font-medium text-zinc-700">ピンの形</legend>
      <div className="mt-1 flex flex-wrap gap-1">
        {PLACE_ICONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            title={o.label}
            className={`flex h-8 w-8 items-center justify-center rounded-md border ${
              value === o.value
                ? "border-black bg-zinc-900 text-white"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <PlaceIcon icon={o.value} size={22} />
          </button>
        ))}
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
  const [icon, setIcon] = useState("📍");
  const noteId = useId();

  useEffect(() => {
    if (state.ok) onAdded();
  }, [state.ok, onAdded]);

  return (
    <div className="flex max-h-[26rem] w-[min(16rem,calc(100vw-3rem))] flex-col gap-2 overflow-y-auto pr-1">
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
          <p className="flex items-center gap-0.5 text-xs text-amber-600">
            <svg
              viewBox="0 -960 960 960"
              width={12}
              height={12}
              fill="currentColor"
              className="block shrink-0"
              aria-hidden
            >
              <path d="m233-120 65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z" />
            </svg>
            <span>{candidate.rating.toFixed(1)}</span>
            {candidate.userRatingCount != null && (
              <span className="text-zinc-500">
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
        <input type="hidden" name="region" value={candidate.region ?? ""} />
        <input type="hidden" name="locality" value={candidate.locality ?? ""} />

        <input type="hidden" name="icon" value={icon} />
        <StatusSelect
          statuses={statuses}
          value={statusId}
          onChange={setStatusId}
        />
        <IconPicker value={icon} onChange={setIcon} />
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

// 地図タップで置いた手動ピン（座標のみ・Google 由来でない）を場所に
// 追加するフォーム。CandidateInfo と同型だが名前は手入力・gpid/住所無し。
export function DraftInfo({
  tripId,
  draft,
  statuses,
  onAdded,
}: {
  tripId: string;
  draft: { lat: number; lng: number };
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
  const [icon, setIcon] = useState("📍");
  const nameId = useId();
  const noteId = useId();

  useEffect(() => {
    if (state.ok) onAdded();
  }, [state.ok, onAdded]);

  return (
    <div className="flex max-h-[26rem] w-[min(16rem,calc(100vw-3rem))] flex-col gap-2 overflow-y-auto pr-1">
      <div>
        <p className="text-sm font-semibold">地図にピンを追加</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}（ドラッグで微調整）
        </p>
      </div>

      <form
        action={formAction}
        className="space-y-2 border-t border-zinc-200 pt-2"
      >
        <input type="hidden" name="lat" value={draft.lat} />
        <input type="hidden" name="lng" value={draft.lng} />
        <input type="hidden" name="icon" value={icon} />

        <label className="block text-xs" htmlFor={nameId}>
          <span className="font-medium text-zinc-700">名前</span>
          <input
            id={nameId}
            type="text"
            name="name"
            required
            autoFocus
            placeholder="例: 集合場所、撮影スポット"
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-black focus:outline-none"
          />
        </label>
        <StatusSelect
          statuses={statuses}
          value={statusId}
          onChange={setStatusId}
        />
        <IconPicker value={icon} onChange={setIcon} />
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
          {isPending ? "追加中..." : "この地点を追加"}
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

// 未マップ place（自由入力で名前だけ作られた場所）に、地図でピンを
// 置いて座標を設定するフォーム。DraftInfo と違い、新規作成ではなく
// 既存 place の location を埋めるだけなので入力欄は無く確定ボタンのみ。
export function LocateInfo({
  tripId,
  placeId,
  placeName,
  draft,
  onDone,
  onCancel,
}: {
  tripId: string;
  placeId: string;
  placeName: string;
  draft: { lat: number; lng: number };
  onDone: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const { error } = await setPlaceLocationAction(
        tripId,
        placeId,
        draft.lat,
        draft.lng,
      );
      if (error) {
        setError(error);
        return;
      }
      onDone();
    });
  };

  return (
    <div className="flex w-[min(16rem,calc(100vw-3rem))] flex-col gap-2 pr-1">
      <div>
        <p className="text-sm font-semibold">位置を設定</p>
        <p className="mt-0.5 text-xs text-zinc-700">「{placeName}」</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}（ドラッグで微調整）
        </p>
      </div>
      <div className="flex gap-2 border-t border-zinc-200 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 flex-1 rounded-md border border-zinc-300 text-sm font-medium transition hover:bg-zinc-50"
        >
          やめる
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className="h-9 flex-1 rounded-md bg-black text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? "設定中..." : "ここに設定"}
        </button>
      </div>
      {error && (
        <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>
      )}
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
  const [editing, setEditing] = useState(false);

  const [state, formAction, isPending] = useActionState(
    updatePlaceAction.bind(null, tripId),
    initialState,
  );
  const [statusId, setStatusId] = useState(place.status_id);
  const [visibility, setVisibility] = useState<Visibility>(place.visibility);
  const [icon, setIcon] = useState(place.icon);
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

  // 削除ボタン（ゴミ箱）。詳細表示・編集中のどちらの下部でも左に置く。
  const deleteButton = canDelete ? (
    <button
      type="button"
      onClick={onDelete}
      disabled={isDeleting}
      aria-label="削除"
      title="削除"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
    >
      <TrashIcon size={18} />
    </button>
  ) : null;

  return (
    <div className="flex max-h-[26rem] w-[min(16rem,calc(100vw-3rem))] flex-col gap-2 overflow-y-auto pr-1">
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold">
            <span className="min-w-0 break-words">{place.name}</span>
            {place.visibility === "private" && (
              <span className="shrink-0 rounded bg-zinc-100 px-1.5 text-xs font-normal text-zinc-600">
                プライベート
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={onDone}
            aria-label="閉じる"
            className="-mr-0.5 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
          >
            <CloseIcon size={14} />
          </button>
        </div>
        {place.formatted_address ? (
          <p className="mt-0.5 text-xs text-zinc-600">
            {place.formatted_address}
          </p>
        ) : (
          place.lat == null && (
            <p className="mt-0.5 text-xs text-amber-700">
              地図未登録（座標なし）
            </p>
          )
        )}
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
          <input type="hidden" name="icon" value={icon} />
          <StatusSelect
            statuses={statuses}
            value={statusId}
            onChange={setStatusId}
          />
          <IconPicker value={icon} onChange={setIcon} />
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
            {deleteButton}
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
            {deleteButton}
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="h-9 flex-1 rounded-md border border-zinc-300 text-sm font-medium transition hover:bg-zinc-50"
              >
                編集
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
