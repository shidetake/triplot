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
  List,
  RNHostView,
  SwipeActions,
  Text,
} from "@expo/ui/swift-ui";
import {
  listRowInsets,
  listRowSeparator,
  listStyle,
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
// SwiftUI は RN で描いた行の高さを知らない（`Host` / `RNHostView` の
// `matchContents` はどの組み合わせでも高さ 0 につぶれ、内側で測ると器の高さに
// 引き伸ばされた値が返る）。なので **RN 側で一度測って `Host` に渡す**。
//
// 測る間は素の行をそのまま描く。見た目は同じなので切り替わりは見えないし、
// 仮に埋め込みが失敗しても行は読める状態で残る。
//
// **行の余白はゼロにする**（`listRowInsets`）。既定のままだと SwiftUI の行が
// 左右にも余白を取り、渡した高さに対して中身が入りきらずに切れる（実測: 高さを
// 60px 増やしても左右が削られて切れたままだった＝足りないのは高さではなかった）。
// 行の最小の高さ。**iOS が描くボタンの方が背の低い行より大きい**ので、これが
// 無いと、はみ出したボタンが器で切られる（実機フィードバック: 1行の TODO
// 〔約32pt〕で赤いボタンの下が切れた。2行の行では収まるので気付きにくい）。
// 44pt は HIG のタップ対象の最小でもある。
//
// **器ではなく行そのものに与える。** 器だけ広げると、中身は元の高さのまま上に
// 寄って下に空きができる（行の側に与えれば、行が持つ alignItems: center が
// 中身を真ん中に置いてくれる）。
const MIN_ROW_H = 44;

export type SwipeAction = {
  // ボタンに出す文言。読み上げ名も兼ねる。
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
      <List modifiers={[listStyle("plain")]}>
        <SwipeActions
          modifiers={[
            listRowSeparator("hidden"),
            listRowInsets({ top: 0, leading: 0, bottom: 0, trailing: 0 }),
          ]}
        >
          <RNHostView>
            <View style={[style, minH]}>{children}</View>
          </RNHostView>
          {/* 引き切った時に実行されるのは**先頭のボタン**。ボタンが増えても
              先頭は削除に揃える——同じ仕草の結果が行によって変わると、覚えた
              仕草の価値が無くなる（メールも引き切りは常に同じ操作）。 */}
          <SwipeActions.Actions edge="trailing" allowsFullSwipe>
            {actions.map((a) => (
              <Button
                key={a.label}
                role={a.destructive ? "destructive" : undefined}
                onPress={a.onPress}
              >
                <Text>{a.label}</Text>
              </Button>
            ))}
          </SwipeActions.Actions>
        </SwipeActions>
      </List>
    </Host>
  );
}
