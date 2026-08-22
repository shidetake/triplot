// Google の評価表示（★ 4.7 (553)）。Material Symbols の star（塗り・amber）で
// 本家 Google マップの星表示に揃える（ui-guidelines「地図・Google 連携まわりの
// ビジュアルは Google に合わせる」）。吹き出しと検索結果の一覧が共有する。
export function PlaceRating({
  rating,
  count,
  className = "",
}: {
  rating: number;
  count: number | null;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <svg
        viewBox="0 -960 960 960"
        width={12}
        height={12}
        fill="currentColor"
        className="block shrink-0 text-amber-600"
        aria-hidden
      >
        <path d="m233-120 65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z" />
      </svg>
      <span className="shrink-0 tabular-nums text-amber-600">
        {rating.toFixed(1)}
      </span>
      {count != null && (
        <span className="shrink-0 tabular-nums text-muted-foreground">
          ({count})
        </span>
      )}
    </span>
  );
}
