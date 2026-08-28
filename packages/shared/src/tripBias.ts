import type { PendingDraft } from "./import/drafts";
import type { StoredEventDraft } from "./import/drafts";
import { dominantCenter, type LatLng } from "./placeMap";
import type { ScheduleEvent } from "./schedule";
import { whereAt, type TransitLeg } from "./whereAt";

// 場所の解決に渡す地理バイアス。
//
// **旅行に1つの中心を持たせるのでは足りない。** 成田 → ホノルル → ハワイ島と
// 動く旅行で、成田の空港の昼食をホノルルのバイアスで引いたら外れる。
// 「その瞬間どこにいたか」を旅程から引く（whereAt）。
//
// 材料は2つ:
// - **確定した移動の予定**。出発地・到着地・両側の TZ を持っている
// - **未確定の移動の下書き**。空港は便名から引けるのでバイアス無しで解決
//   できており、旅行にピンが1つも無い作りたての状態でも座標を持っている
//   （実測: 未割当の移動の下書き 15件中 7件が到着地の座標を持っていた）
//
// 移動が1つも無ければ旅行のピンの中心に落とす（従来の挙動）。

type PlacePoint = { id: string; lat: number | null; lng: number | null };

function pointOf(
  places: PlacePoint[],
  id: string | null | undefined,
): LatLng | null {
  if (!id) return null;
  const p = places.find((x) => x.id === id);
  return p && p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null;
}

// 確定した移動の予定から。到着地の null は「出発地と同じ」の意味なので畳む。
function legsFromEvents(
  events: Pick<
    ScheduleEvent,
    "kind" | "startAt" | "endAt" | "startTz" | "endTz" | "startPlaceId" | "endPlaceId"
  >[],
  places: PlacePoint[],
): TransitLeg[] {
  return events
    .filter((e) => e.kind === "transit" && e.endAt)
    .map((e) => ({
      departAt: e.startAt,
      arriveAt: e.endAt as string,
      departTz: e.startTz,
      arriveTz: e.endTz,
      departPlace: pointOf(places, e.startPlaceId),
      arrivePlace: pointOf(places, e.endPlaceId ?? e.startPlaceId),
    }));
}

// 未確定の移動の下書きから。座標は resolvedDeparture/ArrivalPlace が持つ。
function legsFromDrafts(drafts: PendingDraft[] | null): TransitLeg[] {
  const legs: TransitLeg[] = [];
  for (const d of drafts ?? []) {
    if (d.kind !== "event") continue;
    const ev = d.payload as StoredEventDraft | null;
    if (!ev || ev.kind !== "transit" || !ev.startDate) continue;
    const at = (date: string | null, time: string | null | undefined) =>
      date ? `${date}T${time ?? "00:00"}` : null;
    const departAt = at(ev.startDate, ev.startTime);
    const arriveAt = at(ev.endDate ?? ev.startDate, ev.endTime);
    if (!departAt || !arriveAt) continue;
    legs.push({
      departAt,
      arriveAt,
      departTz: ev.departTz ?? null,
      arriveTz: ev.arriveTz ?? null,
      departPlace: ev.resolvedDeparturePlace
        ? { lat: ev.resolvedDeparturePlace.lat, lng: ev.resolvedDeparturePlace.lng }
        : null,
      arrivePlace: ev.resolvedArrivalPlace
        ? { lat: ev.resolvedArrivalPlace.lat, lng: ev.resolvedArrivalPlace.lng }
        : null,
    });
  }
  return legs;
}

export function tripBiasCenter(input: {
  events: Parameters<typeof legsFromEvents>[0];
  places: PlacePoint[];
  drafts: PendingDraft[] | null;
  // 対象の壁時計とタイムゾーン（費用なら使った日時、予定なら開始）。
  target: { at: string; tz: string | null } | null;
}): LatLng | undefined {
  const legs = [
    ...legsFromEvents(input.events, input.places),
    ...legsFromDrafts(input.drafts),
  ];
  const here = whereAt(legs, input.target);
  if (here) return here;
  const pins = input.places
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({ lat: p.lat as number, lng: p.lng as number }));
  return dominantCenter(pins) ?? undefined;
}
