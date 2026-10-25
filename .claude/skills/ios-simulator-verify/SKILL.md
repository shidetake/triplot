---
name: ios-simulator-verify
description: シミュレータ + maestro で iOS の見た目/挙動を実機に近い形で検証する。新しいUI変更やバグ修正を出荷する前の最初の確認段階。「シミュレータで確認して」「見た目確認して」で使う。docs/development.md の「iOS の実機確認」1段目。
---

# シミュレータ + maestro での確認

3段階の実機確認フロー（docs/development.md）のうち一番速い最初の段。ここで作り込んでから
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

- シミュレータは staging DB を見て、開発用ログインで自動的にログインする（`apps/mobile/.env.local`。
  docs/development.md「シミュレータの向き先」）。書き込みを伴う確認もしてよい。
- `console.log` は Metro のプロセスの標準出力に出る。

## maestro での操作・スクリーンショット

- maestro は `/opt/homebrew/bin/maestro`。無ければ GitHub のリリースから取る
  （`gh release download --repo mobile-dev-inc/maestro --pattern maestro.zip`。Java 17 が要る）。
- flow は yaml でスクラッチパッドに書く（例: 画面遷移→`takeScreenshot`）。
- 実行: `maestro test <flow>.yaml`
- `launchApp` の直後はバンドルを取り直すので数秒白い画面になる。固定の `wait` ではなく
  `extendedWaitUntil: visible: "<文字列>.*"` で待ってから触る（固定の待ちだとタップが空振りする）。
- その場で1枚撮るだけなら `xcrun simctl io booted screenshot <path>.png` でもよい。
- ソフトウェアキーボードが要る確認は
  `defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false` の後に Simulator を
  起動し直す。
- スクリーンショットの保存先: `~/.maestro/tests/<timestamp>/<flow名>/takeScreenshot/<name>.png`
  （`ls -t ~/.maestro/tests/ | head -1` で直近の実行を特定する）。
- **必ず Read ツールでスクリーンショットを画像として読み、目視で確認してから「直った」と報告する**
  （typecheck/lint/testが通ることと見た目が正しいことは別）。

## タップ座標が外れる時

- `tapOn` の文字列は**正規表現の完全一致**。旅行のカードの読み上げ名は
  「Honolulu, 2026/4/28 – 2026/5/5」のように後ろが続くので `tapOn: "Honolulu.*"` と書く。
- 要素が拾えない時は `maestro hierarchy` の出力を整形して、実際の読み上げ名を見る。
- `point` の % は整数だけ（`9.5%` は落ちる）。
- `tapOn: "ラベル文字列"` のテキストマッチが効かない（要素がアクセシビリティツリーに
  文字として出ていない等）場合は、`tapOn: {point: "X%,Y%"}` に切り替える。
- それでも狙った場所を外す場合は、Python/PIL でスクリーンショットのピクセルを直接
  スキャンしてボタン等の正確な境界を測り、パーセンテージに変換する
  （ツールの表示座標と実機のパーセンテージのスケール違いで起きるズレ）。

## テストデータのクリーンアップ

検証用に一時的にイベント/費用等を作った場合は、確認後に後始末する。消すのは自分が
作ったものだけで、staging DB なら直接 SQL で消してよい。本番 DB のデータは原則
書き換えない・消さないので、そもそも本番で検証データを作らない。どうしても本番の
データに触る必要がある時だけ、理由を説明してユーザーの許可を得る（AGENTS.md
「本番のデータは原則書き換えない・消さない」）。
