// データアクセス層の共通結果型。web（server action）も RN も同じ Result を受けて
// 各々の流儀で UI に反映する（web: state＋revalidate/redirect、RN: TanStack Query 等）。
export type Result<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: string): Result<never> => ({ ok: false, error });
