import type { EventFormPrefill, Kind3 } from "@/components/event-form";
import type { PlacePickerInitial } from "@/components/place-picker";
import type {
  EventDraftPlacePrefill,
  EventDraftPrefill,
} from "@triplot/shared/import/drafts";

// 取り込み下書きの事前入力（shared）→ web のフォーム用事前入力への変換。
//
// **クライアント境界の外に置くこと。** 以前は event-form.tsx（"use client"）に
// あったが、旅行詳細ページ（サーバーコンポーネント）がこれを呼んでいた。
// クライアントモジュールの関数はサーバーから見ると実体ではなく参照なので、
// 呼んだ瞬間に "Attempted to call toEventFormPrefill() from the server" で
// 500 になる。予定の下書きがある旅行を開いた時だけ通る経路だったため、
// 実際に下書きが付くまで表に出なかった。
//
// 型の import は erase されるので、"use client" のモジュールから型だけ借りる
// のは問題ない（値を borrow しないこと）。

// place/endPlace だけ形が違う（shared は座標を name/lat/lng で持つ、web の
// PlacePickerInitial は label/coords）ので変換する。
function draftPlaceToInitial(p: EventDraftPlacePrefill): PlacePickerInitial {
  if (!p) return null;
  if (p.kind === "saved") return p;
  if (p.kind === "google") return p;
  return {
    kind: "free",
    label: p.name,
    coords:
      p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null,
    icon: "airport",
  };
}

export function toEventFormPrefill(p: EventDraftPrefill): EventFormPrefill {
  return {
    ...p,
    // kind3 は shared 側で既に "timed" | "allday" | "transit" に絞られている。
    kind3: p.kind3 as Kind3,
    place: draftPlaceToInitial(p.place),
    endPlace: draftPlaceToInitial(p.endPlace),
  };
}
