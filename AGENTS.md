<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## `revalidatePath` はサーバー側 HTML を上書きする

Server Action 内で `revalidatePath` を呼ぶと React が layout を再レンダリングし、
`<html>` 等のサーバー側属性を DOM に書き戻す。

**やってはいけないパターン**: クライアント JS で `<html>` に class を付けた後、
同じ action で `revalidatePath("/", "layout")` を呼ぶと、その class が消える。

```
// NG: テーマ切替 action で revalidatePath → React が dark クラスを上書きして消す
revalidatePath("/", "layout");  // <-- これを消す（5193311 で修正）
```

**判断基準**: `revalidatePath` はサーバー描画コンテンツ（翻訳テキスト等）が
変わるときだけ使う。CSS のみの変化（テーマ等）には不要。
