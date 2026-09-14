import * as Haptics from "expo-haptics";

// 触覚の合図。**意味ごとに1つ決めて、ここだけで持つ。**
//
// 触覚は画面に出ないぶん、同じ意味に違う振動を当てても誰も気付かないまま
// ずれていく（呼ぶ側が毎回その場で強さを選ぶと必ずそうなる）。だから
// 呼ぶ側は「何が起きたか」だけを言い、どう鳴らすかはここが決める。
//
// 今あるのは「掴んだものを刻みながら動かして、離して決める」という1つの
// 流れで、iOS 標準（リマインダーの並べ替え、写真の取り出し、ピッカーの
// ドラム）と同じ3つの節目に対応する。

/** 長押しが成立して、掴めた（動かせる状態になった）。 */
export function hapticPickUp(): void {
  // 掴んだ手応え。離す時より強くして、始まりと終わりを取り違えないようにする。
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** 選んでいるものが1つ隣に移った（時刻・日付・行などの刻みを跨いだ）。 */
export function hapticStep(): void {
  // ピッカーのドラムと同じ。連続で鳴るので一番軽いものを使う。
  void Haptics.selectionAsync();
}

/** 離して決まった（置いた・確定した）。 */
export function hapticDrop(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
