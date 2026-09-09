import { useState, type ReactNode } from "react";
import {
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  Button,
  Host,
  Image,
  List,
  RNHostView,
  SwipeActions,
} from "@expo/ui/swift-ui";
import type { SFSymbol } from "sf-symbols-typescript";
import {
  accessibilityLabel,
  environment,
  listRowInsets,
  listRowSeparator,
  listStyle,
  scrollDisabled,
} from "@expo/ui/swift-ui/modifiers";

// 一覧の行を左スワイプで消せるようにする器（iOS だけ。web にスワイプは無い）。
//
// **中身は OS の仕組みそのもの**（SwiftUI の `.swipeActions`）。少し引くと赤い
// ボタンが出てタップで消す、引き切ると一手で消える（`allowsFullSwipe`）、面の
// 広がり方・跳ね返り・触覚は全部 iOS が持っているものが出る。
//
// 一手で消せるのは、消した後にトーストから元に戻せる一覧だけに付ける
// （docs/ui-guidelines.md「確認もアンドゥも無いなら、一手で消せないように
// する」）。
//
// **同じ仕草をどの一覧でも同じ手触りにするため、器はこの1つに集約する。**
//
// ## 高さを測ってから渡す理由
//
// SwiftUI は RN で描いた行の高さを知らない。**RN 側で一度測り、その値を
// `Host`（RN のレイアウト）と行そのものの `height` の両方に渡す。**
// `RNHostView matchContents` は「中の RN ビューの実寸を SwiftUI の行の高さに
// する」ものなので、中身に確かな高さがあって初めて働く（高さを与えずに使うと
// 0 につぶれる）。
//
// **SwiftUI の行にも高さが要る**——ここを渡さないと行は最小の高さ（44pt）に
// 縮み、はみ出した中身は**描画はされるがタッチを受け取らない**（UIKit は
// 領域の外を当たり判定から外す）。実測で、取り込みの下書き（130〜167pt）は
// スワイプが上端付近でしか始まらず、行の中に置いた旅行のピッカーと
// 「他とまとめる」がどちらも押せなかった。
//
// 測る間は素の行をそのまま描く。見た目は同じなので切り替わりは見えないし、
// 仮に埋め込みが失敗しても行は読める状態で残る。
//
// **行の余白はゼロにする**（`listRowInsets`）。既定のままだと SwiftUI の行が
// 左右にも余白を取り、渡した高さに対して中身が入りきらずに切れる（実測: 高さを
// 60px 増やしても左右が削られて切れたままだった＝足りないのは高さではなかった）。
//
// ## ボタンの大きさは行の高さで決まる（行の下限を下げないと大きいまま）
//
// iOS 26 のスワイプのボタンは、行いっぱいに広がる帯ではなく**中に浮かぶ丸い
// ボタン**で、大きさは「行の高さ − 8pt」（上限 50pt）。ボタン側の modifier
// （`controlSize`・`imageScale`・`Image` の `size`）はどれも効かない——見た目は
// 完全に系が握っていて、アイコンの大きさすら変えられない。
//
// **効くのは行の高さの方**。SwiftUI のドキュメントに
// 「行の高さはこの既定値を下限とし、それ以外は行の中身と行の余白で決まる」と
// あるとおり、`defaultMinListRowHeight`（既定 44pt）が下限になっている。これを
// 下げないと、行をいくら低くしても 44pt の行として扱われ、はみ出したボタンが
// 切られる（実測: 行 44pt でボタンの下が平らに欠けた）。
//
// `@expo/ui` はこの環境値を公開していないので `patches/` で足している。
// 1 にしているのは「下限を無くす」意味で、実際の高さは下の MIN_ROW_H で決める。

// 行の最小の高さ。**このアプリの既定のコントロール高さ（36）に揃える**
// （docs/ui-guidelines.md「余白・サイズ」のボタン・入力・セレクトと同じ値。
// 4px グリッドにも乗る）。中身そのままだと 32pt で、iOS 標準のリマインダーは
// 43pt。その間で、アプリの中に既にある寸法を採る。
//
// **ボタンの都合では決めない。** ボタンは「行の高さ − 8pt」で描かれるので、
// 36pt の行なら 28pt。行を低くすれば素直に小さくなる（上の
// defaultMinListRowHeight を下げてあるため）。
//
// **タップ対象はこの高さでは決まらない。** 行の中の要素はそれぞれ自分の
// 当たり判定を持つので、広げたければ各要素に hitSlop を足す（行の高さを
// 上げても文字の高さしか押せないままになる。実際 TODO のタイトルがそうだった）。
//
// **器ではなく行そのものに与える。** 器だけ広げると、中身は元の高さのまま上に
// 寄って下に空きができる（行の側に与えれば、行が持つ alignItems: center が
// 中身を真ん中に置いてくれる）。
const MIN_ROW_H = 36;

export type SwipeAction = {
  // ボタンに出す SF Symbol。**文言は出さない**（iOS 純正アプリと同じ形。
  // 「削除」の文字を添える純正の作りは採らない — アイコンだけで通じる）。
  icon: SFSymbol;
  // 読み上げ名。画面には出ない。
  label: string;
  onPress: () => void;
  // 破壊的なら赤くする（`destructive`）。取り消しの効くものは既定の色。
  destructive?: boolean;
};

export function SwipeDeleteRow({
  actions,
  enabled = true,
  style,
  measureKey,
  children,
}: {
  // 引いて出るボタン。**先頭が引き切った時に実行されるもの**（iOS の作法）。
  actions: SwipeAction[];
  // false の間はスワイプを受けない（素の行として描く）。
  enabled?: boolean;
  // 行の見た目。
  style?: StyleProp<ViewStyle>;
  // 中身の高さが変わりうる時に渡す（変わったら測り直す）。行の内容から作る
  // ——タイトル・補助行の有無など、高さに効くものだけで十分。
  measureKey?: string;
  children: ReactNode;
}) {
  // 測った高さは測った時の中身とセットで持つ。中身が変われば古い測定値は
  // 使わない＝描画中に 0 に戻る（effect で消しに行かない。React の
  // 「props が変わった時の state の調整」の作法）。
  const [measured, setMeasured] = useState({ key: measureKey, height: 0 });
  const height = measured.key === measureKey ? measured.height : 0;

  const minH = { minHeight: MIN_ROW_H };

  const onLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0 && h !== height) setMeasured({ key: measureKey, height: h });
  };

  if (!enabled || height === 0) {
    return (
      <View style={[style, minH]} onLayout={onLayout}>
        {children}
      </View>
    );
  }

  return (
    <Host style={{ width: "100%", height }}>
      {/* **中でスクロールさせない。** 器は行1つぶんの List なので、中に
          スクロールする余地は無いはずだが、実機では行が単独で動いて外側の
          スクロールとぶつかった（実機フィードバック: 受信箱の下書きが1行ずつ
          スクロールしてしまい操作しづらい。動く行と動かない行があった）。 */}
      <List
        modifiers={[
          listStyle("plain"),
          scrollDisabled(true),
          environment("defaultMinListRowHeight", "1"),
        ]}
      >
        <SwipeActions
          modifiers={[
            listRowSeparator("hidden"),
            listRowInsets({ top: 0, leading: 0, bottom: 0, trailing: 0 }),
          ]}
        >
          <RNHostView matchContents>
            <View style={[style, minH, { height }]}>{children}</View>
          </RNHostView>
          {/* 引き切った時に実行されるのは**先頭のボタン**。ボタンが増えても
              先頭は削除に揃える——同じ仕草の結果が行によって変わると、覚えた
              仕草の価値が無くなる（メールも引き切りは常に同じ操作）。 */}
          <SwipeActions.Actions edge="trailing" allowsFullSwipe>
            {actions.map((a) => (
              <Button
                key={a.label}
                role={a.destructive ? "destructive" : undefined}
                modifiers={[accessibilityLabel(a.label)]}
                onPress={a.onPress}
              >
                {/* **アイコンの大きさは指定できない。決めているのは UIKit。**
                    実行中のビュー階層を覗くと、描いているのは
                    `_UISwipeActionDynamicButton` で、その UIButtonConfiguration が
                    `buttonSize=medium` と、記号の大きさの指定を持っている。
                    **その指定は文言の有無で変わる**——文言が無いと
                    `pointSize=18`（絶対値の決め打ち）、文言があると
                    `textStyle=Footnote`（文字の様式に追従）。だから同じ記号でも
                    アイコンだけの時は 19.3pt、文言と並ぶ時は 14pt になる。
                    記号も `trash` ではなく `trash.fill` に差し替わっていて、
                    渡した Image がそのまま描かれていないことが分かる（Apple の
                    ドキュメントにも「swipe actions のラベルや画像には fill の
                    変種が自動で適用される」とある）。
                    そのため大きさを決める手段は全部無視される——実測で
                    `size`（＝font に変換される）・`imageScale`・`controlSize`
                    （ボタン・List のどちらに付けても buttonSize は medium の
                    まま）・`font`・`resizable`+`frame`・`labelStyle("iconOnly")`
                    のどれも効かなかった。SwiftUI の swipeActions の宣言にも
                    外観の引数は無い（SDK のインターフェースで確認）。
                    文言を渡すとアイコンは文字に合わせた寸法（14pt）になるが、
                    見えない空白で代用すると**アイコンが中心からずれる**ので
                    採らない。 */}
                <Image systemName={a.icon} />
              </Button>
            ))}
          </SwipeActions.Actions>
        </SwipeActions>
      </List>
    </Host>
  );
}
