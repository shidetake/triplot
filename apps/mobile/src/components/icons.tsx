import Svg, { Circle, Path, Rect } from "react-native-svg";

// 操作系 UI アイコン（RN 版）。web の components/icons.tsx と同じ Lucide の
// パスを react-native-svg で描く（docs/ui-guidelines.md「ナビも操作系も同じ
// 中立な線画。iOS でも SF Symbols に置き換えず同じ Lucide パスを RN 側で描き、
// web/iOS で見た目を統一する」）。パスは web 側と同一値を保つこと。

type IconProps = { size?: number; color?: import("react-native").ColorValue };

function LucideIcon({
  size = 18,
  color = "#000",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <Svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

// Lucide: calendar-days（タブ・予定）
export function CalendarDaysIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Path d="M8 2v4" />
      <Path d="M16 2v4" />
      <Rect width={18} height={18} x={3} y={4} rx={2} />
      <Path d="M3 10h18" />
      <Path d="M8 14h.01" />
      <Path d="M12 14h.01" />
      <Path d="M16 14h.01" />
      <Path d="M8 18h.01" />
      <Path d="M12 18h.01" />
      <Path d="M16 18h.01" />
    </LucideIcon>
  );
}

// Lucide: map（タブ・場所）
export function MapIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
      <Path d="M15 5.764v15" />
      <Path d="M9 3.236v15" />
    </LucideIcon>
  );
}

// Lucide: wallet（タブ・費用）
export function WalletIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </LucideIcon>
  );
}

// Lucide: list-todo（タブ・TODO）
export function ListTodoIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Path d="M13 5h8" />
      <Path d="M13 12h8" />
      <Path d="M13 19h8" />
      <Path d="m3 17 2 2 4-4" />
      <Rect x={3} y={4} width={6} height={6} rx={1} />
    </LucideIcon>
  );
}

// Lucide: plus（追加）
export function PlusIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Path d="M5 12h14" />
      <Path d="M12 5v14" />
    </LucideIcon>
  );
}

// Lucide: x（閉じる・破棄）
export function XIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Path d="M18 6 6 18" />
      <Path d="m6 6 12 12" />
    </LucideIcon>
  );
}

// Lucide: trash-2（削除）
export function TrashIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Path d="M3 6h18" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
    </LucideIcon>
  );
}

// Lucide: check（完了チェック）
export function CheckIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Path d="M20 6 9 17l-5-5" />
    </LucideIcon>
  );
}

// Lucide: chevron-right（優先度は回転して使う）
export function ChevronIcon({
  size = 16,
  color = "#000",
  rotate = 0,
}: IconProps & { rotate?: number }) {
  return (
    <Svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: [{ rotate: `${rotate}deg` }] }}
    >
      <Path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

// Lucide: equal（優先度・中）
export function EqualIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Path d="M5 9h14" />
      <Path d="M5 15h14" />
    </LucideIcon>
  );
}

// Lucide: heart（いいね。filled は塗り）
export function HeartIcon({
  size = 16,
  color = "#000",
  filled = false,
}: IconProps & { filled?: boolean }) {
  return (
    <Svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
    </Svg>
  );
}

// Lucide: lock（private 可視性）
export function LockIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Rect width={18} height={11} x={3} y={11} rx={2} ry={2} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </LucideIcon>
  );
}

// Lucide: circle（未チェックの丸。web は input[type=checkbox]、RN は自前）
export function CircleIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Circle cx={12} cy={12} r={10} />
    </LucideIcon>
  );
}

// Lucide: search（検索）
export function SearchIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Circle cx={11} cy={11} r={8} />
      <Path d="m21 21-4.3-4.3" />
    </LucideIcon>
  );
}

// Lucide: inbox（取り込み受信箱）
export function InboxIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <Path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </LucideIcon>
  );
}

// Lucide: settings（設定・旅行の編集）
export function SettingsIcon(p: IconProps) {
  return (
    <LucideIcon {...p}>
      <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <Circle cx={12} cy={12} r={3} />
    </LucideIcon>
  );
}
