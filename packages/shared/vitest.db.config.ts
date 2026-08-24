import { defineConfig } from "vitest/config";

// 実 DB（staging）に繋いで走らせるテスト。`npm test` とは別に持つ:
// ネットワークと staging の資格情報が要るので、pre-commit / pre-push で
// 走らせると資格情報の無い環境で必ず落ちる。手で `npm run test:db`。
//
// dbtests/ は src/ の外に置く。src/**/*.test.ts を拾う通常の設定に
// 巻き込まれないことをファイルの場所で保証するため（命名規則で分けると
// glob の解釈次第で紛れる）。
export default defineConfig({
  test: {
    environment: "node",
    include: ["dbtests/**/*.test.ts"],
    // 実 DB 往復するので既定のタイムアウトだと足りない。
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // 同じ staging を共有するので直列に流す。
    fileParallelism: false,
  },
});
