import type { StoredEventDraft } from "./import/drafts";
import { dominantCenter, type LatLng } from "./placeMap";
import {
  narrowTzByTime,
  resolveExpenseTz,
  type ScheduleEvent,
  type TripTzTimeline,
} from "./schedule";
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

// 下書きから読むのは種別と中身だけ。旅行の中の下書き（PendingDraft）でも、
// 受信箱の未割り当ての下書き（fetchUnassignedDrafts の結果）でも受けられる
// ように、必要な形だけを要求する。
type DraftLike = { kind: string; payload: unknown };

function pointOf(
  places: PlacePoint[],
  id: string | null | undefined,
): LatLng | null {
  if (!id) return null;
  const p = places.find((x) => x.id === id);
  return p && p.lat != null && p.lng != null
    ? { lat: p.lat, lng: p.lng }
    : null;
}

// 確定した移動の予定から。到着地の null は「出発地と同じ」の意味なので畳む。
function legsFromEvents(
  events: Pick<
    ScheduleEvent,
    | "kind"
    | "startAt"
    | "endAt"
    | "startTz"
    | "endTz"
    | "startPlaceId"
    | "endPlaceId"
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
function legsFromDrafts(drafts: DraftLike[] | null): TransitLeg[] {
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
        ? {
            lat: ev.resolvedDeparturePlace.lat,
            lng: ev.resolvedDeparturePlace.lng,
          }
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
  drafts: DraftLike[] | null;
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

// 旅行が決まっていないメールのための地理バイアス。
//
// 取り込みの時点でどの旅行にも割り当てられていないと、旅行の場所も移動も引けない
// ＝バイアスが作れず、店名を Google の場所に解決できない（"HOWZIT BREWING" が
// 文字列のまま残り、地図にも乗らず、カレンダーの同じ店のブロックもまとまらない）。
//
// **材料は同じ受信箱の中にある。** 未割り当ての下書きには移動も混ざっていて、
// 空港は便名から引けるのでバイアス無しでも座標を持っている。日付の近い未割り当ての
// 下書きは同じ旅行のものである可能性が高いので、そこから借りる。
//
// 借りるものは2つあり、**どちらも同じ移動の下書きから出る**:
//   - 端点（時刻と座標）→ その瞬間どこにいたか（whereAt）
//   - TZ の年表      → 対象日が何時のタイムゾーンか
//
// 2つ目が要るのは、whereAt が対象の壁時計を絶対時刻に直す必要があるため。TZ を
// 渡さないと「まだ移動していない＝出発地にいる」に落ちて、ホノルルのレシートに
// 成田のバイアスを当ててしまう（それなら借りない方がまし）。
//
// **移動日だけは精度が落ちる。** その日は候補が2つ（出発側/到着側）あり、旅行が
// 確定していれば両方のバイアスで引いて中心に近い方を採れるが、ここではその手が
// 無い。時刻で絞れなければ先頭候補＝出発側に倒れる。
export function unassignedBiasCenter(
  drafts: DraftLike[] | null,
  target: { date: string; time: string | null } | null,
): LatLng | undefined {
  const legs = legsFromDrafts(drafts);
  if (legs.length === 0) return undefined;
  return tripBiasCenter({
    events: [],
    places: [],
    drafts,
    target: target
      ? {
          at: `${target.date}T${target.time ?? "12:00"}`,
          tz: tzFromLegs(legs, target),
        }
      : null,
  });
}

// 移動の下書きから TZ の年表を組み、対象日の TZ を決める。旅行の中でやっている
// 導出（buildTripTzTimeline → resolveExpenseTz）と同じで、材料が確定した予定では
// なく下書きになっただけ。
function tzFromLegs(
  legs: TransitLeg[],
  target: { date: string; time: string | null },
): string | null {
  const transits = legs
    .filter((l) => l.departTz && l.arriveTz)
    .map((l, i) => ({
      transitId: `leg-${i}`,
      departDate: l.departAt.slice(0, 10),
      arriveDate: l.arriveAt.slice(0, 10),
      departTz: l.departTz as string,
      arriveTz: l.arriveTz as string,
      departTime: l.departAt.slice(11, 16),
      arriveTime: l.arriveAt.slice(11, 16),
    }))
    .sort((a, b) => a.departDate.localeCompare(b.departDate));
  if (transits.length === 0) return null;
  const tl: TripTzTimeline = {
    // 最初の移動より前は出発地にいたとみなす（旅行の default_timezone に
    // あたるものがここには無い）。
    fallbackTz: transits[0].departTz,
    transits,
  };
  const r = resolveExpenseTz(target.date, tl);
  if (r.kind === "single") return r.tz;
  // 移動日。時刻で成立しない候補を落とせるなら落とす。決められなければ
  // 先頭候補（＝出発側）。
  const narrowed = target.time
    ? narrowTzByTime(r.options, tl, target.time)
    : r.options;
  return (narrowed[0] ?? r.options[0]).tz;
}
