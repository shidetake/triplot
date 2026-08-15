---
name: ios-simulator-verify
description: シミュレータ + maestro で iOS の見た目/挙動を実機に近い形で検証する。新しいUI変更やバグ修正を出荷する前の最初の確認段階。「シミュレータで確認して」「見た目確認して」で使う。AGENTS.md の「iOS の実機確認」1段目。
---

# シミュレータ + maestro での確認

3段階の実機確認フロー（AGENTS.md）のうち一番速い最初の段。ここで作り込んでから
`ios-preview-build` → `ios-testflight-build` に進む。

## 落とし穴（このセッションで繰り返し踏んだ）

**`xcrun simctl terminate` + `xcrun simctl launch` の単純な再起動だけでは、Metro から
新しいJSを確実に拾わない**（このセッションでは `backgroundColor:"red"` のようなハード
コードした確認用の値が、複数回の再起動を経ても古い値のまま表示され続けるのを複数回確認した）。

**必ずフルリビルドしてから検証すること:**

```bash
cd apps/mobile
npx expo run:ios --device "iPhone 16 Pro (iOS26)"
```

- `run_in_background: true` で実行し、"Build Succeeded" を確認してから次に進む。
- dev-client バイナリを再インストールし Metro に正しく再接続するので、これが唯一信頼できる方法。

## maestro での操作・スクリーンショット

- flow は yaml でスクラッチパッドに書く（例: 画面遷移→`takeScreenshot`）。
- 実行: `maestro test <flow>.yaml`
- スクリーンショットの保存先: `~/.maestro/tests/<timestamp>/<flow名>/takeScreenshot/<name>.png`
  （`ls -t ~/.maestro/tests/ | head -1` で直近の実行を特定する）。
- **必ず Read ツールでスクリーンショットを画像として読み、目視で確認してから「直った」と報告する**
  （typecheck/lint/testが通ることと見た目が正しいことは別）。

## タップ座標が外れる時

- `tapOn: "ラベル文字列"` のテキストマッチが効かない（要素がアクセシビリティツリーに
  文字として出ていない等）場合は、`tapOn: {point: "X%,Y%"}` に切り替える。
- それでも狙った場所を外す場合は、Python/PIL でスクリーンショットのピクセルを直接
  スキャンしてボタン等の正確な境界を測り、パーセンテージに変換する
  （ツールの表示座標と実機のパーセンテージのスケール違いで起きるズレ）。

## テストデータのクリーンアップ

検証用に一時的にイベント/費用等を作った場合は、確認後に本番/staging DBへ直接SQLで削除する
（`SUPABASE_ACCESS_TOKEN` を使った `supabase db query --linked` 経由。CLAUDE.mdの
「既存データを理由に設計を妥協しない」とは別の話——検証用に作ったテストデータの後始末）。
