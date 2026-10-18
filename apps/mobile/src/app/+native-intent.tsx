// アプリに入ってくる URL の書き換え（expo-router の決まりの場所）。
//
// 共有の拡張機能（expo-share-intent）は、受け取った後にアプリ本体を
// `<scheme>://dataUrl=<key>?nonce=…#weburl` で開く。これはルートではないので
// そのまま渡すと「見つからない」画面になる。中身は ShareIntentProvider が
// 読み取り、旅行を選ぶシートは (app)/_layout.tsx の SharedPlaceOpener が開く。
// なのでここでは画面を動かさない（起動中なら今の画面のまま、起動時なら旅行一覧）。
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  try {
    if (path.includes("dataUrl=")) return initial ? "/trips" : null;
    return path;
  } catch {
    return "/trips";
  }
}
