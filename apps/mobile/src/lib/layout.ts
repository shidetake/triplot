// iOS 26 の NativeTabs（Liquid Glass の浮島タブバー）は RN の flex レイアウトの
// 外（ネイティブの合成レイヤー）に浮くため、RN 側からは高さを取得できない。
// 上端は画面下端から実測 約83pt（複数画面で確認済み）。FAB・トースト等、
// タブバーの上に確実に出したい浮遊要素はここから逃がす。
export const MOBILE_TAB_BAR_TOP = 83;
