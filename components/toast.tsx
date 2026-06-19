"use client";

import { Toast } from "@base-ui/react/toast";

import { CloseIcon } from "@/components/icons";

// グローバルなトースト。design-guidelines「フィードバック」節の方針:
// 結果が見えない成功（その場編集・コピー）やエラーを、画面下中央に出す。
// どこからでも toast("保存しました") で呼べる。<Toaster /> を root layout に1つだけ置く。
//
// 殻（live region の常設＝SR 告知・自動消滅タイマー・ホバー/フォーカスで一時停止・
// スワイプ/× で手動クローズ・重ね表示〔最大3〕）は Base UI Toast に委ねる
// （design-guidelines「部品の作り方」step2）。表示時間 5s・stack 3 等は Base UI の
// 既定が世間の慣例どおりなので上書きしない。意匠（primary 配色・下中央）だけ書く。

// React 外（サーバアクションのコールバック等）からも呼べる standalone manager。
export const toastManager = Toast.createToastManager();

export function toast(text: string): void {
  toastManager.add({ title: text });
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => (
    <Toast.Root
      key={t.id}
      toast={t}
      // 下中央なので下／左右どちらにスワイプしても閉じられる。
      swipeDirection={["down", "left", "right"]}
      className="toast-root pointer-events-auto w-full select-none rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg"
    >
      <div className="flex items-start gap-2">
        <Toast.Title className="min-w-0 flex-1" />
        <Toast.Close
          aria-label="閉じる"
          title="閉じる"
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
