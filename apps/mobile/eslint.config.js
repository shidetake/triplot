// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // 画面遷移は必ず lib/navigate.ts を通す。**同じ瞬間に2つ遷移を出すと
    // ナビゲーションが詰まって、再起動するまであらゆる遷移が無反応になる**
    // （理由と再現は lib/navigate.ts のコメント）。router を直に呼ぶと
    // その歯止めを外すことになるので、ここで止める。
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/navigate.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name='router'][property.name=/^(push|replace|navigate)$/]",
          message:
            "画面遷移は @/lib/navigate の pushOnce / replaceOnce を使う（同時に2つ遷移するとナビゲーションが詰まるため）。",
        },
        // シートの中身は SheetScroll に載せる。素の ScrollView を書くと、
        // キーボード対応のプロパティが片方だけ／両方とも欠けた状態になり、
        // 入力欄や候補がキーボードの裏に隠れる。**同じ壊れ方を3回やっている**
        // （費用カテゴリの追加欄・場所の候補・場所フォーム）ので、目で気付く
        // のを当てにせずここで止める。**シートとして出す画面だけ**が対象
        // （stackPresentation を持つ ScreenStackItem と PageSheet）。素の
        // 画面はスクロールの持ち方が画面ごとに違うので、ここでは縛らない。
        {
          selector:
            "JSXElement[openingElement.name.name='PageSheet'] > JSXElement[openingElement.name.name='ScrollView'], JSXElement[openingElement.name.name='ScreenStackItem']:has(JSXAttribute[name.name='stackPresentation']) > JSXElement[openingElement.name.name='ScrollView']",
          message:
            "シートの中身は @/components/sheet-scroll の SheetScroll を使う（素の ScrollView だとキーボードぶんの余白が入らず、入力欄や候補が裏に隠れる）。",
        },
      ],
    },
  },
]);
