// 評価の組ごとの設定。組の名前は test:seed-emails の --set と同じ（Gmail のラベルは
// apps/web/.env.local の TRIPLOT_TEST_GMAIL_LABEL_<組>）。旅行の id もそちらに置く
// （TRIPLOT_EVAL_STAGING_TRIP_<組> / TRIPLOT_EVAL_PROD_TRIP_<組>）。
//
// ここに置くのは採点の規則だけ。決めた理由は docs/import-eval.md の「採点の規則」。
export const SETS = {
  hawaii: {
    // 予約番号が同じ2人分の航空券が、合体の規則で1件にまとまる。モデルに関係ないので数えない。
    excludedMerchants: [/delta air/i],
    // メールから来ていない本番の予定（手で入れたもの）。取りこぼしに数えない。
    notFromEmailTitles: ["ランニング"],
  },
};
