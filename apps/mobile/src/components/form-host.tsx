import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

// フォームの入力途中を保持する仕組み（web の components/form-host.tsx と同じ設計・
// 同じ draftKey 体系）。
//
// なぜ要るか: ネイティブのシートは下スワイプで簡単に閉じられる（× を出さない）。
// 閉じるたびに入力が消えると、間違って閉じた時の被害が web のボトムシートより
// 大きい。閉じても残るなら閉じ操作を気軽にできる。
//
// 保持はセッション中（アプリが生きている間）だけでよいのでメモリに持つ。
// Set/Map などシリアライズできない値もそのまま置ける。
type FormDraftHost = {
  // 在れば「このキーで下書きを保持する」。無ければ保持しない（＝素の useState）。
  draftKey?: string;
};

const FormDraftContext = createContext<FormDraftHost>({});

export function FormHostProvider({
  draftKey,
  children,
}: {
  draftKey?: string;
  children: ReactNode;
}) {
  return (
    <FormDraftContext.Provider value={{ draftKey }}>
      {children}
    </FormDraftContext.Provider>
  );
}

const store = new Map<string, Record<string, unknown>>();

function readDraft(
  key: string,
  field: string,
): { hit: boolean; value: unknown } {
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

// useState の drop-in 置き換え。周囲に draftKey があればその下書きから初期値を
// 復元し、変更のたびに書き戻す（＝閉じて開き直しても残る）。draftKey が無ければ
// 素の useState と同じ挙動。field は同一フォーム内で一意な文字列（state の名前）。
export function useDraft<T>(
  field: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const { draftKey } = useContext(FormDraftContext);

  const [value, setValue] = useState<T>(() => {
    if (draftKey) {
      const { hit, value } = readDraft(draftKey, field);
      if (hit) return value as T;
    }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    if (draftKey) writeDraft(draftKey, field, value);
  }, [draftKey, field, value]);

  return [value, setValue];
}

// 送信／削除に成功したときに呼ぶ。周囲の draftKey の下書きを丸ごと破棄する
// （＝次に同じフォームを開いたら真っさらになる）。draftKey が無ければ no-op。
export function useClearDraft(): () => void {
  const { draftKey } = useContext(FormDraftContext);
  return useCallback(() => {
    if (draftKey) store.delete(draftKey);
  }, [draftKey]);
}
