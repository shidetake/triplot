// 操作系 UI アイコン。フォントもパッケージも使わず、Lucide
// (https://lucide.dev, ISC) のパスをそのまま inline で埋める（依存ゼロ・
// FOUT 無し）。座標系は Lucide 標準の viewBox "0 0 24 24"・線画 stroke。
//
// ※ 場所カテゴリ(PlaceIcon) と費用カテゴリ(ExpenseCategoryIcon) は別系統で、
//   Google マップ内蔵 POI と揃える / 概念を共有するため Material Symbols（塗り）。
//   ここ(操作系)は線画の Lucide に統一。役割でファミリーを分けている。

function LucideIcon({
  size,
  className,
  children,
}: {
  size: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

// Lucide: trash-2
export function TrashIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </LucideIcon>
  );
}

// Lucide: check
export function CheckIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </LucideIcon>
  );
}

// Lucide: chevron-right
export function ChevronIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="m9 18 6-6-6-6" />
    </LucideIcon>
  );
}

// Lucide: x
export function CloseIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </LucideIcon>
  );
}

// Lucide: share (box + 上向き矢印)
export function ShareIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </LucideIcon>
  );
}
