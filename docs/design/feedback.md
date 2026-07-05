# ユーザーフィードバック（不具合報告・要望）設計

ユーザーがアプリ内（アカウントメニュー →「フィードバック」）から不具合報告・要望を送り、
管理者が管理ページ（`/admin`）で確認して対応状態を管理する。

## データモデル

`feedback`（1投稿 = 1行）:

| 列 | 意味 |
|---|---|
| `user_id` | 投稿者（users FK） |
| `kind` | `bug`（不具合）/ `feature`（要望） |
| `body` | 本文（1〜2000字） |
| `path` | どの画面から送ったか（web = pathname / ネイティブ = 画面名。取れなければ null） |
| `user_agent` | 送信時の User-Agent（不具合の再現環境の手がかり） |
| `status` | `open`（未対応）/ `done`（対応済み）。管理者が切り替える |

- RLS: 本人は自分の行の insert / select のみ。admin（`is_app_admin()`）は全行 select ＋ update。
- 列レベル権限で insert はユーザー入力列のみ・update は `status` のみに制限
  （管理者でも本文・投稿者を改変できない。delete は誰にも許可しない）。

## 書き込み経路（web / ネイティブ共通）

書き込みは **`POST /api/feedback` の1経路**（[architecture.md](../architecture.md) の
「変更系は RN からも使えるよう API エンドポイントに出す」に従う）:

- 認証は cookie（web）と `Authorization: Bearer <access_token>`（ネイティブ）の両対応。
- 入力の契約は `packages/shared/src/feedback.ts` の Zod スキーマ（単一の真実。
  ネイティブ側も同じスキーマで検証できる）。
- insert は**本人のクライアント**で行い、RLS の insert-own を効かせる（defense in depth）。
- `locale`（ja/en）はクライアントが送る（web = `useLocale()`、ネイティブ = 端末ロケール）。
  受付確認メールの言語に使う。

## メール通知（Resend）

insert 成功後、`after()`（応答後実行）で 2 通送る。送信失敗は投稿の成否に影響しない
（best-effort）。`RESEND_API_KEY` 未設定の環境ではスキップ＝メール無しでも機能は完結する:

| 宛先 | 内容 | 言語 |
|---|---|---|
| 投稿者（auth の email） | 受付確認＋種別・本文の控え | 投稿時の `locale`（ja/en）。文面キーは共有カタログ `packages/shared/messages/` |
| 管理者（env `FEEDBACK_NOTIFY_EMAIL`） | 新着通知（種別・本文・投稿者・path） | 日本語固定 |

差出人は `noreply@triplot.app`。

## 管理者の運用

- `/admin` の「フィードバック」節に新しい順で全件表示。未対応行に「対応済みにする」、
  対応済み行（opacity dim）に「未対応に戻す」。
- 未対応件数はアカウントメニューの「管理」行とアバター右上のバッジに出る（admin のみ）。
