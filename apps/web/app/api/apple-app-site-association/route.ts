// Universal Links の宣言ファイル。iOS はアプリのインストール時に
// https://triplot.app/.well-known/apple-app-site-association を取得し、
// ここに載っているパスのリンクを Safari ではなくアプリで開く。
//
// ルートハンドラにしているのは Content-Type を application/json に固定するため
// （Apple は拡張子なしのこのファイルに JSON を要求する。public/ の静的ファイル
// として置くと拡張子から MIME を決められず octet-stream になる）。
// 実際のパス /.well-known/... へは next.config.ts の rewrite で繋いでいる。
//
// appIDs は <Apple Team ID>.<bundle identifier>（apps/mobile/app.config.ts）。
// staging ビルドは bundle identifier が別で、associatedDomains も宣言しないので
// ここには載せない。
const AASA = {
  applinks: {
    details: [
      {
        appIDs: ["D37LHZNVW3.app.triplot.mobile"],
        components: [{ "/": "/join/*", comment: "旅行の招待リンク" }],
      },
    ],
  },
};

export function GET() {
  return new Response(JSON.stringify(AASA), {
    headers: {
      "content-type": "application/json",
      // 端末は数日キャッシュする。招待リンクのパスは変わらないので長めで良い。
      "cache-control": "public, max-age=86400",
    },
  });
}
