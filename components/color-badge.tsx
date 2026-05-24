import type { ReactNode } from "react";

// 色付きの丸ピル（白文字）。費用カテゴリ・場所ステータスなど trip ごとの色付き
// ラベルで共用する。CJK テキストの縦中央を全ブラウザで揃えるための調整
// （leading-none ＋ テキストだけ 0.5px 下げ）をここに集約しているので、新しい
// バッジもこれを使えば自動で揃う。icon を渡すとテキストの左に並ぶ。
export function ColorBadge({
  color,
  icon,
  children,
}: {
  color: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium leading-none text-white"
      style={{ backgroundColor: color }}
    >
      {icon}
      {/* iOS Safari の CJK は行ボックス内でやや上目に出るため、テキストだけ実寸
          0.5px 下げて視覚的に中央へ寄せる（leading-none と併用・全ブラウザ一律）。 */}
      <span className="relative top-[0.5px]">{children}</span>
    </span>
  );
}
