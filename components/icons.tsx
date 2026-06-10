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

// Lucide: pencil（編集）
export function EditIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </LucideIcon>
  );
}

// Lucide: equal（= 横2本線。優先度「中」に使う）
export function EqualIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="M5 9h14" />
      <path d="M5 15h14" />
    </LucideIcon>
  );
}

// Lucide: heart（いいね）。filled の時は呼び出し側で fill="currentColor" を上書き。
export function HeartIcon({
  size = 16,
  className,
  filled = false,
}: {
  size?: number;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
    </svg>
  );
}

// Lucide: crown（管理者バッジ。Slack / Discord 等のオーナー表示に倣う）
export function CrownIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <path d="M5 21h14" />
    </LucideIcon>
  );
}

// Lucide: save（フロッピー・編集の保存）
export function SaveIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
      <path d="M7 3v4a1 1 0 0 0 1 1h7" />
    </LucideIcon>
  );
}

// Lucide: plus（追加）
export function PlusIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </LucideIcon>
  );
}

// Lucide: inbox（取り込み）
export function InboxIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </LucideIcon>
  );
}

// Lucide: settings（設定・歯車）
export function SettingsIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </LucideIcon>
  );
}

// Lucide: log-out（ログアウト）
export function LogOutIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </LucideIcon>
  );
}

// Lucide: search（検索・虫めがね）
export function SearchIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LucideIcon size={size} className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </LucideIcon>
  );
}
