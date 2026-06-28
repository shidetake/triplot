<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Server Action は完了後に自動でページを再レンダリングする

Next.js App Router は Server Action 完了後、`revalidatePath` の有無に関わらず
React が自動的にページを再レンダリングする。その際 `<html>` 等のサーバー側属性が
DOM に書き戻される。

**やってはいけないパターン**: クライアント JS で `<html class>` を変更した後に
Server Action を呼ぶと、その変更が再レンダリングで消える。

```tsx
// NG: テーマ切替を Server Action 経由にすると React が dark クラスを上書きして消す
await setThemeAction(value);  // → 再レンダリング → <html class=""> で dark 消える
```

**正しいパターン**: サーバー描画コンテンツが変わらない変更（CSS クラス・
ユーザー設定 Cookie 等）は Server Action を使わず `document.cookie` で直書きする。

```tsx
// OK: クライアントから直接 Cookie に書く → 再レンダリングなし → クラスが消えない
document.cookie = `NEXT_THEME=${value}; path=/; max-age=...`;
```

Server Action が必要なのは、サーバー描画コンテンツ（翻訳テキスト等）が
変わる場合だけ（例: `setLocaleAction` は `revalidatePath` が必要）。
