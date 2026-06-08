# デザインガイドライン

triplot の UI 規約（テーマ・アイコン・ボタン配色・コピー）。新しい UI を足すときはこれに従う。
このファイルは `CLAUDE.md` から `@` で読み込まれる（AI エージェントも人も同じ単一の真実を見る）。

## テーマ・コピー

- UI は **MVP 期間中ライトモード固定**（`app/globals.css` の `color-scheme: light`）。固定が外れるまで `dark:` variant は追加しない。
- アプリ内コピーは日本語、コメントは日英混在 — 周囲のファイルに合わせる。

## アイコンの 2 ファミリー

役割で使い分け。混ぜない:

| 用途 | ファミリー | ファイル | 形 |
|---|---|---|---|
| **操作系**（保存・追加・削除・編集・閉じる…） | Lucide line（ISC） | `components/icons.tsx` | viewBox `0 0 24 24` / 線画 stroke |
| **場所カテゴリ**（ピンの形） | Material Symbols Rounded FILL | `lib/placeIcons.ts` → `components/place-list.tsx` の `PlaceIcon` | viewBox `0 -960 960 960` / 塗り |
| **費用カテゴリ** | Material Symbols Rounded FILL | `components/expense-category-icon.tsx` | 同上 |

理由: 操作系は中立な線画で「動作を表す」、カテゴリ系は Google Maps の POI と概念を揃えるため Material Symbols（塗り）。新規アイコンを足すときも上の表に従う。SVG は web フォントを使わずパスを inline 埋め込み（依存ゼロ・FOUT 無し）。MS パスの取得は `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/{name}/fill1/24px.svg`、Lucide は `https://unpkg.com/lucide-static/icons/{name}.svg` から拾える。

## 文言は極力アイコンに寄せる（ローカライズ準備）

将来の i18n コストを下げるため、**動作を表すボタンはアイコンで表現する**のを既定とする。テキストラベルは「アイコンだけで意味が確実に伝わらない」場合だけ。例:

- 保存／追加／作成／編集／削除／閉じる／検索 → アイコン
- 「キャンセル」など他に表しようの無いものは現状テキスト可（必要なら後で見直し）
- アクセシビリティ用に `aria-label` + ホバー用に `title` は必ず付ける（読み上げ・hover ツールチップが文言の代わり）

## ボタンの配色

ボタンの色はその文脈での **役割** を表す:

| 役割 | 色 | 例 |
|---|---|---|
| **Primary**（その文脈で最も主要な動作） | 黒塗り (`bg-black text-white`) | 保存 / 追加 / 編集（その popup の主動作） / 検索 |
| **Destructive**（破壊的・取り消せない） | 赤枠 (`border-red-200 text-red-600`)、サイズは小さめキープ | 削除 |
| **Neutral / Navigate**（閉じる・キャンセル・タブ切替） | 白枠 or 透明 | × 閉じる / キャンセル / 鉛筆だけの "編集を始める" 系（タブ的） |

「Primary は黒」がブレるとレイアウトが浮くので、新規ボタンを足す時は **その popup / form 内で何がその場の主動作か** を考えて選ぶこと。SavedInfo の編集 ✏️ もその popup の主動作なので黒。

## ナビ / メニューの使い分け

| コントロール | 形 | 意味 |
|---|---|---|
| **アバター**（右上） | 写真 or 頭文字の丸 | アカウント（email / 設定 / ログアウト）。Google は写真を引ける、Apple は写真が無いので頭文字フォールバック |
| **ハンバーガー** | ☰ | グローバルナビ（行き先）。行き先が複数ある時に使う |
| **ミートボール / ケバブ** | ⋯ / ⋮ | その対象への**コンテキスト操作**（編集・削除・共有…の overflow）。旅行内の操作はこれ |

「同じ目的には同じコントロール」。グローバルナビに ⋯ を使う等の用途違いをしない。
