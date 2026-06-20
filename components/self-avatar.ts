// ログインユーザ自身のアバターの中立グレー丸（design-guidelines「定型部品」アバター画像）。
// MemberAvatar の hue 丸とは別系統＝「旅行内で誰か」を色で識別する用途ではなく、アカウント
// 自身（識別不要）なので中立 zinc で統一する。account-menu / avatar-upload で同じ recipe を
// 逐語コピーしていたのを 1 ソース化。サイズ（h-8/h-16）・hover・中身（img or 頭文字）は
// 各ホスト（Menu.Trigger / button）が足す。
export const selfAvatarClass =
  "flex items-center justify-center overflow-hidden rounded-full bg-zinc-700 font-medium text-white ring-1 ring-foreground/10";
