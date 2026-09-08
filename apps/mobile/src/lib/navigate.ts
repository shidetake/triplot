import { router } from "expo-router";

// 画面遷移の入口。**`router.push` を直に呼ばず、必ずここを通す。**
//
// **同じ瞬間に2つ遷移を出すとナビゲーションが詰まる。** 実機フィードバック:
// カレンダーの予定を開いたのとほぼ同時に受信箱を押したら、以後**あらゆる
// 画面遷移が無反応**になった（シートだけでなく旅行のタップも開かない）。戻る
// ことはできるのに前に進めず、アプリを再起動するまで直らない。
//
// シミュレータで再現して確かめた: タップのハンドラは走っていて（ログが出る）
// `router.push` も呼ばれているのに、何も開かない。つまり取りこぼしではなく、
// **ネイティブ側が「まだシートを出している最中」のまま固まる**。上流にも
// 似た凍結の報告がある（expo/expo #37213・#33658）。
//
// 直し方は「2つ目を出さない」。押した直後の指示は捨てる——**取りこぼしても
// 押し直せばいいが、詰まると再起動しか手がない**ので、落とす側に倒す。
//
// 500ms は「1回のタップで2つ動く」を止めるには十分で、シートが開いてから
// 次を押すまでの間（人の手では最短でも 500ms 以上かかる）は邪魔しない長さ。
const GUARD_MS = 500;

let lastAt = 0;

type Href = Parameters<typeof router.push>[0];

export function pushOnce(href: Href): void {
  const now = Date.now();
  if (now - lastAt < GUARD_MS) return;
  lastAt = now;
  router.push(href);
}

// 置き換え（履歴を積まない遷移）。同じ理由で間隔を空ける。
export function replaceOnce(href: Href): void {
  const now = Date.now();
  if (now - lastAt < GUARD_MS) return;
  lastAt = now;
  router.replace(href);
}
