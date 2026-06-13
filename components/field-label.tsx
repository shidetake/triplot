import type { ReactNode } from "react";

// フォームのフィールドラベル（入力の上の太字ラベル）。design-guidelines
// 「テキスト色の階層」「定型部品」に従い、色指定なし＝foreground(87%) の
// `font-medium`。`required` で必須の赤アスタリスクを付ける（散らばりがちな
// `<span className="ml-0.5 font-normal text-red-600">*</span>` をここに集約）。
//
// 使い方:
//   <label className="block text-sm">
//     <FieldLabel required>タイトル</FieldLabel>
//     <input className="mt-1 ..." />
//   </label>
//
// 外側の <label className="block text-sm"> と入力はインラインのまま（フィールドの
// レイアウトは多様なので包まない）。これはラベル span だけの最小プリミティブ。
export function FieldLabel({
  children,
  required,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <span className="font-medium">
      {children}
      {required && (
        <span className="ml-0.5 font-normal text-red-600">*</span>
      )}
    </span>
  );
}
