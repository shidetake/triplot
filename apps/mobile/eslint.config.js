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
      ],
    },
  },
]);
