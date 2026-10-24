// staging の DB に migration を当てる（npm run db:push:staging）。
//
// staging だけに絞ったトークンで、supabase-staging/ の link 先（staging）に
// 当てる。本番は supabase/ の link 先で、npm run db:push（scripts/db-push.mjs）。
// どちらに当てるかがコマンドの名前で自明になるよう、link を張り替えない。

import { runStagingCli } from "./staging-supabase.mjs";

console.log("db-push-staging: staging に migration を適用します");
const r = runStagingCli(["db", "push", "--linked"], { inherit: true });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log("db-push-staging: 完了");
