"use client";

import { useTranslations } from "next-intl";
import { Toast } from "@base-ui/react/toast";
import {
  TOAST_MS,
  TOAST_WITH_ACTION_MS,
} from "@triplot/shared/toastDuration";

import { CloseIcon } from "@/components/icons";

// グローバルなトースト。ui-guidelines「フィードバック」節の方針:
// 結果が見えない成功（その場編集・コピー）やエラーを、画面下中央に出す。
// どこからでも toast("保存しました") で呼べる。<Toaster /> を root layout に1つだけ置く。
//
// 殻（live region の常設＝SR 告知・自動消滅タイマー・ホバー/フォーカスで一時停止・
// スワイプ/× で手動クローズ・重ね表示〔最大3〕）は Base UI Toast に委ねる
// （ui-guidelines「部品の作り方」step2）。stack 3 等は Base UI の既定が世間の
// 慣例どおりなので上書きしない。意匠（primary 配色・下中央）と、**押させる
// トーストだけ長くする表示時間**（`toastDuration.ts`）を書く。

// React 外（サーバアクションのコールバック等）からも呼べる standalone manager。
export const toastManager = Toast.createToastManager();

// アクション（「元に戻す」等）は任意。取り消せる操作は、確認を挟むより
// 済ませてから戻せる方が手数が少ない（ui-guidelines「確認の要否は復旧コストで
// 決める」＝確認とアンドゥは同じ問題への2つの答え）。
export type ToastAction = { label: string; onClick: () => void };

export function toast(text: string, action?: ToastAction): void {
  toastManager.add({
    title: text,
    data: action,
    timeout: action ? TOAST_WITH_ACTION_MS : TOAST_MS,
  });
}

function ToastList() {
  const t = useTranslations("common");
  const { toasts, close } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      // 下中央なので下／左右どちらにスワイプしても閉じられる。
      swipeDirection={["down", "left", "right"]}
      className="toast-root pointer-events-auto w-full select-none rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg"
    >
      <div className="flex items-start gap-2">
        <Toast.Title className="min-w-0 flex-1" />
        {toast.data ? (
          <Toast.Action
            // 押せると分かる形にする（下線はリンクの記号なので使わない。
            // 世の中のトーストの操作はボタンとして描かれる）。面は
            // 「前景色の α 重ね」の1式で、ライト/ダークとも自動で効く。
            className="-my-1 shrink-0 rounded bg-primary-foreground/15 px-2 py-1 font-medium transition hover:bg-primary-foreground/25"
            // 押したらその場で引っ込める（残っていると二度押せる。RN 側の
            // toast() も同じく押した時点で消す）。
            onClick={() => {
              close(toast.id);
              (toast.data as ToastAction).onClick();
            }}
          >
            {(toast.data as ToastAction).label}
          </Toast.Action>
        ) : null}
        <Toast.Close
          aria-label={t("close")}
          title={t("close")}
          className="-mr-1 shrink-0 rounded text-primary-foreground/60 transition hover:text-primary-foreground"
        >
          <CloseIcon size={16} />
        </Toast.Close>
      </div>
    </Toast.Root>
  ));
}

export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <Toast.Portal>
        {/* 下中央のシンプルな縦スタック。最新が下（画面端に近い側）に積まれる。
            viewport 自体はクリックを通し、各トーストだけ pointer-events を受ける。 */}
        <Toast.Viewport className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex w-[min(92vw,24rem)] -translate-x-1/2 flex-col-reverse items-center gap-2">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
