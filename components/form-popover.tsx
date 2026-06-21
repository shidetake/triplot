"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Popover } from "@base-ui/react/popover";
import { Drawer } from "vaul";

import { FormHostProvider } from "./form-host";

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

// 閉じる経路は design-guidelines の3つ＝Esc・背景クリック（outside-press）・フォーム内の
// ×/キャンセル/送信（onClose を直接呼ぶ）。それ以外の focus-out（タブ移動などフォーカスが
// 外れただけ）では閉じない（入力途中に意図せず消えるのを防ぐ。3経路の外）。
// 背景クリックで閉じても誤爆しないのは Base UI Popover が outsidePressEvent の mouse を
// `intentional`（pointerup＝本物のクリックで発火・ホイールスクロールやドラッグでは発火しない）
// に固定しているため（PopoverRoot.js 参照）。
function makeOnOpenChange(onClose: () => void) {
  return (next: boolean, details: { reason: string }) => {
    if (next) return;
    if (details.reason === "focus-out") return;
    onClose();
  };
}

// ボトムシートのスナップ点（viewport 比）。2/3 で開き、ハンドルで全画面(1.0)まで広げられる。
const SHEET_SNAP_POINTS: number[] = [0.66, 1];
// グリップ帯（pt-4 + ハンドル + pb-3）の概算高。スクロール領域の高さからこれを差し引く。
const SHEET_HANDLE_BAND = "2.25rem";

// 狭い画面のボトムシート（Vaul）。Instagram のコメントシートに挙動を揃える:
//  - 開く高さは画面 2/3（snapPoints[0]）。ハンドルを上にドラッグすると全画面(1.0)まで拡大。
//    拡大はハンドルのみ（ボディを上に引いても拡大せずスクロールするのが vaul の素の挙動）。
//  - ボディはスクロール。スクロールしきって上端で更に下へ引くとシートが縮小→閉じる（Instagram と
//    同じ＝vaul の素の挙動。handleOnly にするとこのボディ操作が死ぬので使わない）。
//  - Vaul の制約「snapPoints だと中身は最上スナップでしか overflow スクロールしない」を回避するため、
//    スクロール領域の高さを現在スナップの可視高に詰める。snapPoints は viewport 比なので、Content を
//    h-[100dvh] にすると可視高 = snap × 100dvh（＝下の maxHeight 計算）。
//  - 背景 dim はタップで閉じる。触ってもスクロールしない（overflow 固定＋dim が touch を飲む）。
//    × は出さない＝閉じるのは「ハンドル/ボディ下スワイプ」か「背景タップ」。
//  - 閉じても入力途中の下書きは消えない（各フォームが draftKey で保持）。だから閉じ操作は気軽。
//
// 閉じアニメ（dim フェードアウト＋シート下降）を全経路で出すため、open を内部に持つ:
//  - フォームの保存/削除成功は onDone を呼ぶので、子の onDone を「内部クローズ」に差し替える。
//  - Vaul のドラッグ↓は onOpenChange(false) 経由で内部クローズ。
//  - 内部クローズ＝open を false に → Vaul がシートを下げ・dim が opacity でフェードアウト
//    → アニメ分待ってから親へ通知（アンマウント）。
function NarrowSheet({
  label,
  onClose,
  draftKey,
  children,
}: {
  label?: string;
  onClose: () => void;
  draftKey?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  // 現在のスナップ（2/3 ↔ 全画面）。スクロール領域の高さ算出に使う。
  const [snap, setSnap] = useState<number | string | null>(SHEET_SNAP_POINTS[0]);
  const snapFraction = typeof snap === "number" ? snap : 1;

  const requestClose = useCallback(() => setOpen(false), []);

  // 閉じ始めたら、Vaul の下降と dim フェードアウト（~500ms）の後に親へ通知してアンマウント。
  useEffect(() => {
    if (open) return;
    const t = setTimeout(onClose, 550);
    return () => clearTimeout(t);
  }, [open, onClose]);

  // 背景スクロールの固定。modal=false（フォーム内のポータル popover を生かすため）なので
  // Vaul の scroll-lock には乗れない。代わりにドキュメントスクローラの overflow を自前で固定する。
  // 開いている間ずっと（閉じアニメ中も）ロックし、アンマウントで元に戻す。
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = prev;
    };
  }, []);

  // フォームの保存/削除成功（onDone）を内部クローズに差し替える（閉じアニメを通すため）。
  const child = isValidElement<{ onDone?: () => void }>(children)
    ? cloneElement(children, { onDone: requestClose })
    : children;

  return (
    <FormHostProvider draftKey={draftKey} inSheet>
      {/* 自前の dim。Vaul の Portal の外＝body に出して自分でライフサイクル管理する
          （Portal 内だと閉じる時 Vaul が即撤去してフェードアウトが切れる）。せり上がりに
          合わせて animate-in でフェードイン・閉じで animate-out でフェードアウト。
          touch-none＝この帯を触っても背景はスクロールしない。タップで閉じる（Instagram と同じ）。 */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            className={`fixed inset-0 z-40 touch-none bg-black/40 duration-500 ${
              open
                ? "animate-in fade-in-0"
                : "animate-out fade-out-0 [animation-fill-mode:forwards]"
            }`}
            onClick={requestClose}
            aria-hidden
          />,
          document.body,
        )}
      <Drawer.Root
        open={open}
        modal={false}
        // 2/3 で開き、ハンドルで全画面まで拡大。handleOnly は付けない＝ボディの
        // スクロール／スクロール上端での下スワイプ閉じ（vaul の素の挙動）を生かす。
        snapPoints={SHEET_SNAP_POINTS}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
      >
        <Drawer.Portal>
          <Drawer.Content
            aria-label={label}
            // Content は全画面高（h-[100dvh]）に固定。snapPoints は viewport 比で translate する
            // ので、これで可視高 = snap × 100dvh になり、下のスクロール領域の高さ計算が成立する。
            // dvh＝実表示ビューポート基準（vh だと iOS でツールバーの裏に下端が潜る）。
            className="fixed inset-x-0 bottom-0 z-50 flex h-[100dvh] flex-col rounded-t-lg bg-white outline-none"
          >
            {/* 掴みやすいよう上下に余白を取った厚めのグリップ帯（タップミス防止）。 */}
            <div className="flex shrink-0 cursor-grab justify-center pt-4 pb-3 active:cursor-grabbing">
              <Drawer.Handle className="!h-1.5 !w-12" />
            </div>
            <Drawer.Title className="sr-only">{label}</Drawer.Title>
            {/* スクロール領域は「現在スナップの可視高ぶん」に詰める＝snapPoints でも 2/3 表示の
                まま中身がネイティブスクロールできる（vaul の最上スナップ制約を回避）。
                overscroll-contain: 末端まで来てもスクロールが背景に伝わらない。 */}
            <div
              className="overflow-y-auto overscroll-contain pb-5"
              style={{
                maxHeight: `calc(100dvh * ${snapFraction} - ${SHEET_HANDLE_BAND})`,
              }}
            >
              {child}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </FormHostProvider>
  );
}

// クリック位置の近くに出すポップオーバー。予定追加・費用追加など入力フォームを
// 同じ見た目で出すための共通部品。開閉・Esc・はみ出し回避の位置決めは Base UI に委ねる
// （design-guidelines「部品の作り方」step2）。
//
// fullScreenOnNarrow=true の大きいフォームは、狭い画面（< 640px）ではボトムシートで出す
// （22rem のカードが画面に対して大きすぎて窮屈なため）。広い画面ではタップ位置のポップアップ。
export function FormPopover({
  anchor,
  onClose,
  children,
  label,
  fullScreenOnNarrow,
  draftKey,
}: {
  anchor: Anchor;
  onClose: () => void;
  children: React.ReactNode;
  // 渡すと dialog のアクセシブル名にする。
  label?: string;
  // 大きい入力フォーム: 狭い画面でボトムシート表示する。
  fullScreenOnNarrow?: boolean;
  // ボトムシート時の下書き保持キー（同じフォームを閉じて開き直すと入力が残る）。
  // 一意な文字列にする（例 `expense:new:${tripId}`）。ポップオーバー時は無視される。
  draftKey?: string;
}) {
  const narrow = useMediaQuery(FULLSCREEN_BELOW);

  if (fullScreenOnNarrow && narrow) {
    return (
      <NarrowSheet label={label} onClose={onClose} draftKey={draftKey}>
        {children}
      </NarrowSheet>
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
