"use client";

import { useEffect, useState } from "react";

import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";

export type Anchor = { x: number; y: number };

// 全画面に切り替える幅の閾値。マジックナンバーではなく**フォーム幅から導く**:
// ポップアップ時のフォームは w-[22rem]=352px。352px のカードが余白付きで“浮いてる
// カード”として読める下限が ~640px（352px が画面幅の ~55%）。これ未満は窮屈なので全画面。
// ＝下の Popup の w-[22rem] を変えるならこの閾値も見直す。
const FULLSCREEN_BELOW = "(max-width: 639px)";

// メディアクエリの一致を購読する小フック（クライアント専用。FormPopover は
// 開いた時だけ client でマウントされるので SSR フォールバックは不要だが一応ガード）。
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

// 入力データを失わないよう、外側タッチ／スクロール（outside-press）やフォーカス
// 外れ（focus-out）では閉じない。閉じるのは Esc と、フォーム内の × / キャンセル /
// 送信（onClose を直接呼ぶ）だけ。Popover/Dialog 共通のロジック。
function makeOnOpenChange(onClose: () => void) {
  return (next: boolean, details: { reason: string }) => {
    if (next) return;
    if (details.reason === "outside-press" || details.reason === "focus-out") {
      return;
    }
    onClose();
  };
}

// クリック位置の近くに出すポップオーバー。予定追加・費用追加など入力フォームを
// 同じ見た目で出すための共通部品。開閉・Esc・はみ出し回避の位置決めは Base UI に委ねる
// （design-guidelines「部品の作り方」step2）。
//
// fullScreenOnNarrow=true の大きいフォームは、狭い画面（< 640px）では全画面で出す
// （22rem のカードが画面に対して大きすぎて窮屈なため。design-guidelines のレスポンシブ＝
// 「切り替えたい事柄の本質軸＝ここでは幅」で判定）。広い画面ではタップ位置のポップアップ。
export function FormPopover({
  anchor,
  onClose,
  children,
  label,
  fullScreenOnNarrow,
}: {
  anchor: Anchor;
  onClose: () => void;
  children: React.ReactNode;
  // 渡すと dialog のアクセシブル名にする。
  label?: string;
  // 大きい入力フォーム: 狭い画面で全画面表示する。
  fullScreenOnNarrow?: boolean;
}) {
  const narrow = useMediaQuery(FULLSCREEN_BELOW);

  if (fullScreenOnNarrow && narrow) {
    // 狭い画面＝ボトムシート。下からせり上がり、上に元画面が薄暗く残るので「どこに居て
    // どこから開いたか」が分かる（全画面だと文脈が消える問題への対応）。閉じるは × / Esc
    // （背景タップ＝outside-press では閉じない＝入力データを失わない。makeOnOpenChange）。
    return (
      <Dialog.Root open onOpenChange={makeOnOpenChange(onClose)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 data-[starting-style]:opacity-0" />
          <Dialog.Popup
            aria-label={label}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col overflow-y-auto rounded-t-lg bg-white shadow-xl outline-none transition-transform duration-300 ease-out data-[starting-style]:translate-y-full"
          >
            {children}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  // 広い画面（PC 等）＝クリック座標を virtual anchor にしてその点の近くに開く。
  const virtualAnchor = {
    getBoundingClientRect: () =>
      ({
        x: anchor.x,
        y: anchor.y,
        width: 0,
        height: 0,
        top: anchor.y,
        left: anchor.x,
        right: anchor.x,
        bottom: anchor.y,
      }) as DOMRect,
  };

  return (
    <Popover.Root open modal={false} onOpenChange={makeOnOpenChange(onClose)}>
      <Popover.Portal>
        <Popover.Positioner
          anchor={virtualAnchor}
          side="bottom"
          align="start"
          alignOffset={8}
          sideOffset={0}
          className="z-50"
        >
          <Popover.Popup
            aria-label={label}
            className="max-h-[80vh] w-[22rem] overflow-y-auto rounded-lg border border-foreground/20 bg-white shadow-xl outline-none"
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
