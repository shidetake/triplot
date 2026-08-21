import { UIManager } from "react-native";

// Google Maps SDK for iOS の法的通知。
//
// Google Maps Platform の帰属表示ポリシーは、**地図上の Google ロゴとは別に**
// この通知をアプリ内に載せることを求めている（「独立したメニュー項目、または
// 『このアプリについて』メニューの一部」が推奨）。中身は SDK 自身が抱えている
// ので、npm の依存関係を走査する scripts/gen-licenses.mjs では拾えない
// ＝オープンソースライセンス一覧とは別に取る必要がある。
//
// 取得元は native の `[GMSServices openSourceLicenseInfo]`。react-native-maps
// はこれを AIRGoogleMap ビューマネージャの定数として公開している（JS 側の
// 名前付き export は無い）ので、同ライブラリが Commands を引くのと同じ経路で
// 読む（decorateMapComponent.ts が getViewManagerConfig を使っている）。
export function googleMapsLegalNotice(): string | null {
  try {
    // RN の型は Commands しか宣言していないが、実体には constantsToExport の
    // 中身が Constants として乗る（AIRGoogleMapManager.mm 参照）。
    const config = UIManager.getViewManagerConfig("AIRGoogleMap") as {
      Constants?: { legalNotice?: unknown };
    } | null;
    const notice = config?.Constants?.legalNotice;
    return typeof notice === "string" && notice.length > 0 ? notice : null;
  } catch {
    return null;
  }
}
