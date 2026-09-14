import { type ReactElement } from "react";
import { Host, Popover, RNHostView, Text, VStack } from "@expo/ui/swift-ui";
import { font, frame, padding } from "@expo/ui/swift-ui/modifiers";

// **初めての人にだけ出す案内**（docs/ui-guidelines.md「初めての人にだけ出す案内」）。
//
// 出すかどうかは呼ぶ側が**状態**で決める（その機能が今この画面で意味を持つか ×
// その人がまだ使っていないか）。出来事をきっかけに出すと、その瞬間に画面を見て
// いた人にしか届かない——あとから開いた人には何も起きない。
//
// **吹き出しは自分で描かない。** 中身は OS の仕組みそのもの（SwiftUI の
// `.popover()`）で、指す相手を向く矢印・面の質感・縁・影・画面端での回り込み・
// 外をタップして閉じる・ライト/ダークの追従は全部 iOS が持っているものが出る。
// `@expo/ui` の Popover は `presentationCompactAdaptation(.popover)` を当てて
// いるので、iPhone でもシートに化けずに吹き出しのまま出る。
//
// 自前で描くと、角の尖り・影・暗い地での浮かせ方・端での回り込みを全部自分で
// 面倒見ることになる（一度やってみて、どれも OS の出来に届かなかった）。
export function FirstRunTip({
  visible,
  title,
  text,
  onDismiss,
  anchorWidth,
  anchorHeight,
  children,
}: {
  visible: boolean;
  // 見出し＝ここで何ができるか（短く）。本文＝なぜ今それが出ているか。
  // Apple の TipKit と同じ2段。1段だけだと、状況の説明が先に来て何ができる
  // のかが後ろに埋もれる。
  title: string;
  text: string;
  // 外をタップして閉じた時も呼ばれる（＝見たことにする）。
  onDismiss: () => void;
  // 指す相手（children）の寸法。SwiftUI は RN で描いた中身の寸法を知らないので
  // 渡す（swipe-delete-row と同じ事情。こちらは固定の操作子なので実測は不要）。
  anchorWidth: number;
  anchorHeight: number;
  children: ReactElement;
}) {
  // 出さない時は器ごと挟まない＝普段の描画・当たり判定を一切変えない。
  if (!visible) return children;
  return (
    <Host style={{ width: anchorWidth, height: anchorHeight }}>
      <Popover
        isPresented
        arrowEdge="top"
        onIsPresentedChange={(presented) => {
          if (!presented) onDismiss();
        }}
      >
        <Popover.Trigger>
          <RNHostView matchContents>{children}</RNHostView>
        </Popover.Trigger>
        <Popover.Content>
          {/* 文字の大きさはアプリの字階に合わせる（本文14・補助12）。
              SwiftUI の既定は17で、この中だけ大きく見えてしまう。 */}
          <VStack
            alignment="leading"
            spacing={4}
            modifiers={[frame({ width: 232 }), padding({ all: 14 })]}
          >
            <Text modifiers={[font({ size: 14, weight: "semibold" })]}>
              {title}
            </Text>
            <Text modifiers={[font({ size: 12 })]}>{text}</Text>
          </VStack>
        </Popover.Content>
      </Popover>
    </Host>
  );
}
