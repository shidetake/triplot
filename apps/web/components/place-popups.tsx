"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/components/toast";
import { confirmDialog } from "@/components/confirm-dialog";

import {
  createPlaceAction,
  deletePlaceAction,
  type PlaceMutationState,
  setPlaceLocationAction,
  updatePlaceAction,
} from "@/app/trips/[tripId]/actions";
import type { Visibility } from "@triplot/shared/types/database";

import { getIcon, type PinOption } from "@triplot/shared/placeIcons";

import { TrashIcon, EditIcon, PlusIcon, SaveIcon } from "./icons";
import { FieldLabel } from "./field-label";
import { MessageBox } from "./message-box";
import { PlaceIconPicker } from "./place-icon-picker";
import { PrivateBadge } from "./private-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CloseButton } from "./close-button";
import { gmapsUrl, PlaceIcon, type PlaceRow } from "./place-list";
import type { CandidatePlace } from "./place-search";

// 再 export（既存の `import { type PinOption } from "./place-popups"` を壊さない）。
export type { PinOption };

const initialState: PlaceMutationState = { ok: false, error: null };

function TentativeField({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTranslations("place");
  return (
    <fieldset className="text-sm">
      <legend className="font-medium">{t("status")}</legend>
      <div className="mt-1 flex gap-3">
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            name="tentative"
            value="false"
            checked={!value}
            onChange={() => onChange(false)}
          />
          <span>{t("statusConfirmed")}</span>
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            name="tentative"
            value="true"
            checked={value}
            onChange={() => onChange(true)}
          />
          <span>{t("statusCandidate")}</span>
        </label>
      </div>
    </fieldset>
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
  const t = useTranslations("place");
  if (!editable) {
    // 非作成者は shared 場所の公開範囲を変えられない（RPC と同条件）。
    return <input type="hidden" name="visibility" value={value} />;
  }
  return (
    <fieldset className="text-sm">
      <legend className="font-medium">{t("visibility")}</legend>
      <div className="mt-1 flex gap-3">
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            name="visibility"
            value="shared"
            checked={value === "shared"}
            onChange={() => onChange("shared")}
          />
          <span>{t("visibilityShared")}</span>
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            name="visibility"
            value="private"
            checked={value === "private"}
            onChange={() => onChange("private")}
          />
          <span>{t("visibilitySelfOnly")}</span>
        </label>
      </div>
    </fieldset>
  );
}

function IconPicker({
  tripId,
  options,
  value,
  onChange,
}: {
  tripId: string;
  options: PinOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("place");
  const [addOpen, setAddOpen] = useState(false);
  const sorted = [...options].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <fieldset className="text-sm">
      <legend className="font-medium">{t("pinShape")}</legend>
      <div className="mt-1 flex flex-wrap gap-1">
        {sorted.map((o) => {
          const catalogEntry = getIcon(o.icon);
          const label = catalogEntry ? t(`icon.${catalogEntry.key}`) : o.label;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.icon)}
              title={label}
              className={`flex h-8 w-8 items-center justify-center rounded-md border ${
                value === o.icon
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-foreground/20 text-muted-foreground hover:bg-foreground/10"
              }`}
            >
              <PlaceIcon icon={o.icon} size={20} />
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          title={t("addIconAria")}
          aria-label={t("addIconAria")}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-foreground/20 text-blue-600 transition hover:bg-blue-600/10"
        >
          <PlusIcon size={16} />
        </button>
      </div>
      {addOpen && (
        <PlaceIconPicker
          tripId={tripId}
          pinOptions={options}
          onAdded={(key) => {
            setAddOpen(false);
            onChange(key);
          }}
          onClose={() => setAddOpen(false)}
        />
      )}
    </fieldset>
  );
}

export function CandidateInfo({
  tripId,
  candidate,
  pinOptions,
  onAdded,
}: {
  tripId: string;
  candidate: CandidatePlace;
  pinOptions: PinOption[];
  onAdded: () => void;
}) {
  const t = useTranslations("place");
  const [state, formAction, isPending] = useActionState(
    createPlaceAction.bind(null, tripId),
    initialState,
  );
  // Google 候補から追加するときは「確定」がデフォルト。
  const [tentative, setTentative] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("shared");
  const [icon, setIcon] = useState("pin");
  const noteId = useId();

  useEffect(() => {
    if (state.ok) onAdded();
  }, [state.ok, onAdded]);

  return (
    <div className="flex max-h-[26rem] w-[min(16rem,calc(100vw-3rem))] flex-col gap-2 overflow-y-auto pb-2 pr-1">
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
              <span className="text-muted-foreground">
                ({candidate.userRatingCount})
              </span>
            )}
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">{candidate.address}</p>
      </div>

      <form action={formAction} className="space-y-2 border-t border-foreground/10 pt-2">
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
        <TentativeField value={tentative} onChange={setTentative} />
        <IconPicker
          tripId={tripId}
          options={pinOptions}
          value={icon}
          onChange={setIcon}
        />
        <VisibilityField
          value={visibility}
          onChange={setVisibility}
          editable
        />
        <label className="block text-sm" htmlFor={noteId}>
          <FieldLabel>{t("memo")}</FieldLabel>
          <Input
            id={noteId}
            type="text"
            name="note"
            placeholder={t("placeholderMemo")}
            className="mt-1 block w-full"
          />
        </label>

        <Button
          type="submit"
          disabled={isPending}
          aria-label={t("addPlaceAria")}
          title={t("addPlaceAria")}
          className="w-full"
        >
          <PlusIcon size={20} />
        </Button>
        {state.error && (
          <MessageBox kind="error" dense>
            {state.error}
          </MessageBox>
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
  pinOptions,
  onAdded,
}: {
  tripId: string;
  draft: { lat: number; lng: number };
  pinOptions: PinOption[];
  onAdded: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    createPlaceAction.bind(null, tripId),
    initialState,
  );
  const [tentative, setTentative] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("shared");
  const t = useTranslations("place");
  const [icon, setIcon] = useState("pin");
  const nameId = useId();
  const noteId = useId();

  useEffect(() => {
    if (state.ok) onAdded();
  }, [state.ok, onAdded]);

  return (
    <div className="flex max-h-[26rem] w-[min(16rem,calc(100vw-3rem))] flex-col gap-2 overflow-y-auto pb-2 pr-1">
      <div>
        <p className="text-sm font-semibold">{t("addPin")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}{t("dragHint")}
        </p>
      </div>

      <form
        action={formAction}
        className="space-y-2 border-t border-foreground/10 pt-2"
      >
        <input type="hidden" name="lat" value={draft.lat} />
        <input type="hidden" name="lng" value={draft.lng} />
        <input type="hidden" name="icon" value={icon} />

        <label className="block text-sm" htmlFor={nameId}>
          <FieldLabel>{t("name")}</FieldLabel>
          <Input
            id={nameId}
            type="text"
            name="name"
            required
            autoFocus
            placeholder={t("placeholderName")}
            className="mt-1 block w-full"
          />
        </label>
        <TentativeField value={tentative} onChange={setTentative} />
        <IconPicker
          tripId={tripId}
          options={pinOptions}
          value={icon}
          onChange={setIcon}
        />
        <VisibilityField
          value={visibility}
          onChange={setVisibility}
          editable
        />
        <label className="block text-sm" htmlFor={noteId}>
          <FieldLabel>{t("memo")}</FieldLabel>
          <Input
            id={noteId}
            type="text"
            name="note"
            placeholder={t("placeholderMemo")}
            className="mt-1 block w-full"
          />
        </label>

        <Button
          type="submit"
          disabled={isPending}
          aria-label={t("addPinAria")}
          title={t("addPinAria")}
          className="w-full"
        >
          <PlusIcon size={20} />
        </Button>
        {state.error && (
          <MessageBox kind="error" dense>
            {state.error}
          </MessageBox>
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
  const t = useTranslations("place");
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
        <p className="text-sm font-semibold">{t("setLocation")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("settingLocationFor", { name: placeName })}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}{t("dragHint")}
        </p>
      </div>
      <div className="flex gap-2 border-t border-foreground/10 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1"
        >
          {t("cancelLocation")}
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className="flex-1"
        >
          {isPending ? t("settingLocation") : t("confirmLocation")}
        </Button>
      </div>
      {error && (
        <MessageBox kind="error" dense>{error}</MessageBox>
      )}
    </div>
  );
}

export function SavedInfo({
  tripId,
  place,
  pinOptions,
  canEdit,
  canDelete,
  canChangeVisibility,
  onDone,
}: {
  tripId: string;
  place: PlaceRow;
  pinOptions: PinOption[];
  canEdit: boolean;
  canDelete: boolean;
  canChangeVisibility: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("place");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState(false);

  const [state, formAction, isPending] = useActionState(
    updatePlaceAction.bind(null, tripId),
    initialState,
  );
  const [tentative, setTentative] = useState(place.tentative);
  const [visibility, setVisibility] = useState<Visibility>(place.visibility);
  const [icon, setIcon] = useState(place.icon);
  const noteId = useId();

  const [isDeleting, startDelete] = useTransition();

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const onDelete = async () => {
    if (!(await confirmDialog({ title: t("deleteTitle") }))) return;
    startDelete(async () => {
      const { error } = await deletePlaceAction(tripId, place.id);
      if (error) {
        toast(t("deleteFailed", { error }));
        return;
      }
      onDone();
    });
  };

  // 削除ボタン（ゴミ箱）。詳細表示・編集中のどちらの下部でも左に置く。
  const deleteButton = canDelete ? (
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
  ) : null;

  return (
    <div className="flex max-h-[26rem] w-[min(16rem,calc(100vw-3rem))] flex-col gap-2 overflow-y-auto pb-2 pr-1">
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold">
            <span className="min-w-0 break-words">{place.name}</span>
            {place.visibility === "private" && (
              <PrivateBadge className="shrink-0" />
            )}
          </p>
          <CloseButton onClick={onDone} className="-mr-0.5 -mt-0.5 shrink-0" />
        </div>
        {place.formatted_address ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {place.formatted_address}
          </p>
        ) : (
          place.lat == null && (
            <p className="mt-0.5 text-xs text-amber-700">
              {t("noLocation")}
            </p>
          )
        )}
        {!editing && place.note && (
          <p className="mt-1 text-xs text-muted-foreground">{place.note}</p>
        )}
        <a
          href={gmapsUrl(place)}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-xs text-blue-600 hover:underline"
        >
          {t("openGoogleMaps")}
        </a>
      </div>

      {editing ? (
        <form
          action={formAction}
          className="space-y-2 border-t border-foreground/10 pt-2"
        >
          <input type="hidden" name="place_id" value={place.id} />
          <input type="hidden" name="icon" value={icon} />
          <TentativeField value={tentative} onChange={setTentative} />
          <IconPicker
          tripId={tripId}
          options={pinOptions}
          value={icon}
          onChange={setIcon}
        />
          <VisibilityField
            value={visibility}
            onChange={setVisibility}
            editable={canChangeVisibility}
          />
          <label className="block text-sm" htmlFor={noteId}>
            <FieldLabel>{t("memo")}</FieldLabel>
            <Input
              id={noteId}
              type="text"
              name="note"
              defaultValue={place.note ?? ""}
              placeholder={t("placeholderMemo")}
              className="mt-1 block w-full"
            />
          </label>
          <div className="flex gap-2">
            {deleteButton}
            <Button
              type="submit"
              disabled={isPending}
              aria-label={tCommon("save")}
              title={tCommon("save")}
              className="flex-1"
            >
              <SaveIcon size={20} />
            </Button>
          </div>
          {state.error && (
            <MessageBox kind="error" dense>
              {state.error}
            </MessageBox>
          )}
        </form>
      ) : (
        (canEdit || canDelete) && (
          // 他のフォーム（expense/event/place create）と同じレイアウト:
          // 削除は固定幅で左、primary は flex-1 で残りを全部取る。
          <div className="flex gap-2 border-t border-foreground/10 pt-2">
            {deleteButton}
            {canEdit && (
              <Button
                type="button"
                onClick={() => setEditing(true)}
                aria-label={tCommon("edit")}
                title={tCommon("edit")}
                className="flex-1"
              >
                <EditIcon size={18} />
              </Button>
            )}
          </div>
        )
      )}
    </div>
  );
}
