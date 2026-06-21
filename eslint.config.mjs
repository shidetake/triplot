import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ─────────────────────────────────────────────────────────────────────────────
// デザインガイドライン lint（docs/design-guidelines.md の“機械判定できる禁則”を eslint で弾く）。
// pre-commit / pre-push の eslint に乗るので、逸脱はコミット時点で止まる＝強いハーネス。
//
// ここに入れるのは「現状コードに正当な使用が無い＝誤検出ゼロで error にできる」硬いルールだけ。
// text-white（動的な彩度地色の上で許可）や border-zinc（週カレンダー等の例外）のような判断の要る
// ものは入れない（既存の正当例を潰さないため。やるなら個別 disable コメントで例外を明示してから）。
//
// 正当な逸脱は `// eslint-disable-next-line no-restricted-syntax -- 理由` で“理由つきで”許可する。
// クラス文字列はベタ文字列(Literal)とテンプレート(TemplateElement)の両方に出るので2セレクタ張る。
const bannedClassPatterns = [
  {
    re: "text-zinc-",
    msg: "text-zinc-* は使わない。text-foreground / text-muted-foreground / text-subtle-foreground（design-guidelines「テキスト色の階層」）。",
  },
  {
    re: "divide-zinc-",
    msg: "divide-zinc-* は使わない。divide-foreground/10 などボーダーの α 階段で（design-guidelines「ボーダー色」）。",
  },
  {
    re: "hover:bg-zinc-",
    msg: "hover:bg-zinc-* は使わない。hover:bg-foreground/10（state layer 方式。design-guidelines「hover 背景」）。",
  },
  {
    // bg-black/40 等の半透明（モーダル backdrop・dim）は許可。ベタの bg-black（/が続かない）だけ禁止。
    re: "bg-black(?!\\/)",
    msg: "ベタの bg-black は使わない。primary トークン（bg-primary text-primary-foreground）で（design-guidelines「ボタンの配色」）。背景 dim は bg-black/40 を使う。",
  },
  {
    re: "rounded-2xl",
    msg: "rounded-2xl は使わない。角丸は rounded / rounded-md / rounded-lg / rounded-full（design-guidelines「角丸」）。",
  },
  {
    re: "rounded-3xl",
    msg: "rounded-3xl は使わない。角丸は rounded / rounded-md / rounded-lg / rounded-full（design-guidelines「角丸」）。",
  },
  {
    re: "transition-colors",
    msg: "transition-colors のようなプロパティ限定は使わない。素の transition で統一（design-guidelines「hover を持つ要素」）。",
  },
];

const designGuidelineRules = bannedClassPatterns.flatMap(({ re, msg }) => [
  { selector: `Literal[value=/${re}/]`, message: msg },
  { selector: `TemplateElement[value.raw=/${re}/]`, message: msg },
]);

// 破壊的確認は素の window.confirm を使わず confirmDialog（design-guidelines「確認ダイアログ」）。
designGuidelineRules.push(
  {
    selector:
      "CallExpression[callee.object.name='window'][callee.property.name='confirm']",
    message:
      "window.confirm は使わない。confirmDialog()（components/confirm-dialog.tsx）を使う（design-guidelines「確認ダイアログ」）。",
  },
  {
    selector: "CallExpression[callee.name='confirm']",
    message:
      "素の confirm() は使わない。confirmDialog()（components/confirm-dialog.tsx）を使う（design-guidelines「確認ダイアログ」）。",
  },
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...designGuidelineRules],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
