"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

// フォーム下書きの「ホスト」コンテキスト。FormPopover がフォームをどう出しているか
// （ボトムシート or タップ位置ポップオーバー）と、下書きを溜める先のキーを子フォームへ伝える。
//
// なぜ要るか:
//  - ボトムシート（狭い画面）は Instagram 同様「下スワイプで閉じる＝×無し」「閉じても入力が残る」。
//    その下書き保持を、各フォームが mount/unmount を跨いで実現するための器。
//  - ポップオーバー（広い画面）は従来どおり ×・背景クリックで閉じ、閉じたら破棄。
//  - だから保持は「シートのときだけ」＝draftKey が在るときだけ効く。inSheet で × の出し分けも決まる。
type FormHost = {
  // 在れば「このキーで下書きを保持する」。無ければ保持しない（＝従来の useState 相当）。
  draftKey?: string;
  // ボトムシートの中か（× を隠す／スワイプのみ閉じる UI かの判定に使う）。
  inSheet: boolean;
};

const FormHostContext = createContext<FormHost>({ inSheet: false });

export function FormHostProvider({
  draftKey,
  inSheet,
  children,
}: {
  draftKey?: string;
  inSheet: boolean;
  children: React.ReactNode;
}) {
  // value は draftKey/inSheet が変わらない限り安定させたいが、props 由来でほぼ不変なので
  // そのまま渡す（FormPopover は1フォーム1マウントで頻繁に再レンダしない）。
  return (
    <FormHostContext.Provider value={{ draftKey, inSheet }}>
      {children}
    </FormHostContext.Provider>
  );
}

// 下書きの実体。draftKey -> { field -> value } のメモリストア。
// セッション中（ページ遷移やリロードをしない間）だけ生きればよいので in-memory で十分。
// Set/Map など非シリアライズ値もそのまま持てる（localStorage と違いシリアライズ不要）。
const store = new Map<string, Record<string, unknown>>();

function readDraft(key: string, field: string): { hit: boolean; value: unknown } {
  const bag = store.get(key);
  if (bag && field in bag) return { hit: true, value: bag[field] };
  return { hit: false, value: undefined };
}

function writeDraft(key: string, field: string, value: unknown) {
  let bag = store.get(key);
  if (!bag) {
    bag = {};
    store.set(key, bag);
  }
  bag[field] = value;
}

function dropDraft(key: string) {
  store.delete(key);
}

// useState の drop-in 置き換え。周囲に draftKey があればその下書きから初期値を復元し、
// 変更のたびに書き戻す（＝閉じて開き直しても残る）。draftKey が無ければ素の useState と同じ
// 挙動（＝ポップオーバーや未対応フォームでは何も変わらない）。
//
// field は同一フォーム内で一意な文字列（state の名前をそのまま使えばよい）。
export function useDraft<T>(
  field: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const { draftKey } = useContext(FormHostContext);

  const [value, setValue] = useState<T>(() => {
    if (draftKey) {
      const { hit, value } = readDraft(draftKey, field);
      if (hit) return value as T;
    }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  // 値が変わるたびストアへ反映（次回マウント時の初期値になる）。draftKey が無いときは何もしない。
  useEffect(() => {
    if (draftKey) writeDraft(draftKey, field, value);
  }, [draftKey, field, value]);

  return [value, setValue];
}

// 送信／削除に成功したときに呼ぶ。周囲の draftKey の下書きを丸ごと破棄する
// （＝次に同じフォームを開いたら真っさらになる）。draftKey が無ければ no-op。
export function useClearDraft(): () => void {
  const { draftKey } = useContext(FormHostContext);
  return useCallback(() => {
    if (draftKey) dropDraft(draftKey);
  }, [draftKey]);
}

// ボトムシートの中で表示されているか（× を隠すなど UI 出し分け用）。
export function useInSheet(): boolean {
  return useContext(FormHostContext).inSheet;
}
