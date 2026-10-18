import type { PlaceCandidate } from "@triplot/shared/placesSearch";

// Google マップから共有された場所を、旅行を選ぶシート（trips/shared-place）から
// 場所タブへ渡す受け渡し口。URL のパラメータに候補を丸ごと載せると長くなるので、
// 中身はここに置き、場所タブには「届いている」印（?sharedPlace=1）だけを渡す。
// 場所タブが取り出したら空にする（二度開かない）。
let pending: PlaceCandidate | null = null;

export function putSharedPlace(c: PlaceCandidate): void {
  pending = c;
}

export function takeSharedPlace(): PlaceCandidate | null {
  const c = pending;
  pending = null;
  return c;
}
