// 共通の inline SVG アイコン。フォントは使わず Material Symbols のパスを
// そのまま埋める（依存ゼロ・FOUT 無し）。座標系は viewBox "0 -960 960 960"。

export function TrashIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 -960 960 960"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm120-160h80v-360h-80v360Zm160 0h80v-360h-80v360Z" />
    </svg>
  );
}
