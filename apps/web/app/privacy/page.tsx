import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー | triplot",
};

// プライバシーポリシー（公開ページ・認証不要）。Google OAuth の確認要件と
// App Store の要件を満たす単一の真実。実装の実態（Supabase 東京・受信メール
// 90日削除・カレンダーは app.created スコープのみ等）と齟齬が出たら必ず
// こちらも更新すること。法的文書なので i18n は当面 ja のみ。
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/"
        className="text-sm text-muted-foreground transition hover:text-foreground"
      >
        ← triplot
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">プライバシーポリシー</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        最終更新日: 2026年7月14日
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
        <section className="space-y-2">
          <p>
            triplot（以下「本サービス」）は、旅行の計画・費用の記録と精算を行う
            サービスです。本ポリシーは、本サービス（web
            版および iOS アプリ）が取得する情報とその取り扱いを定めます。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">1. 取得する情報</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium">アカウント情報</span> — Google
              または Apple アカウントでのサインインにより、メールアドレス・
              名前・プロフィール画像を取得します。
            </li>
            <li>
              <span className="font-medium">ユーザーが入力する情報</span> —
              旅行の名称・日程・予定・場所・費用・TODO・旅行内の表示名など、
              利用者が本サービスに登録した内容。
            </li>
            <li>
              <span className="font-medium">転送されたメール</span> —
              レシート取り込み機能で、利用者が専用アドレスに転送したメールの
              内容（本文および本文中のレシートリンク先の内容）。
            </li>
            <li>
              <span className="font-medium">Cookie</span> —
              ログインセッションの維持、テーマ・言語設定の保存に使用します。
              広告や横断的なトラッキングを目的とした Cookie は使用しません。
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">2. 利用目的</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>旅行計画・費用記録・精算などの本サービスの機能提供</li>
            <li>転送されたメールからの費用・予定の自動抽出（下記 4 参照）</li>
            <li>不正利用の防止・障害対応</li>
          </ul>
          <p>
            取得した情報を広告目的で利用すること、および第三者に販売することは
            ありません。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">3. Google ユーザーデータの取り扱い</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium">Google サインイン</span> —
              メールアドレス・名前・プロフィール画像を認証とアカウント表示の
              ためにのみ使用します。
            </li>
            <li>
              <span className="font-medium">Google カレンダーへのエクスポート</span> —
              利用者が明示的に操作したときに限り、本サービスが作成した
              カレンダーの作成と、そのカレンダーへの予定の書き込みのみを
              行います（スコープ: <code>calendar.app.created</code>）。
              利用者の既存カレンダーの内容を読み取ることはありません。
              アクセストークンは利用者のブラウザ内でのみ一時的に保持し、
              本サービスのサーバーへ送信・保存しません。
            </li>
          </ul>
          <p>
            本サービスによる Google API から取得した情報の利用は、
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Google API サービスのユーザーデータに関するポリシー
            </a>
            （限定使用の要件を含む）に準拠します。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">4. 外部サービス（処理の委託先）</h2>
          <p>本サービスは以下の外部サービスを利用します。</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Supabase — データベースおよび認証（東京リージョン）</li>
            <li>Vercel — ホスティング（東京リージョン）</li>
            <li>Cloudflare — DNS および転送メールの受信中継</li>
            <li>Google Maps / Places API — 地図表示・場所検索</li>
            <li>
              大規模言語モデル（LLM）—
              転送されたレシートメールから費用・予定を抽出する処理にのみ、
              メール内容を送信します。抽出以外の目的で送信すること、モデルの
              学習のために提供することはありません。
            </li>
            <li>Resend — 運営からの通知メール送信</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">5. データの保管と削除</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>データは Supabase（東京リージョン）に保管します。</li>
            <li>転送されたメールの原文は受信から 90 日後に自動削除されます。</li>
            <li>
              旅行を削除すると、その旅行に紐づく予定・場所・費用などの
              データも削除されます。
            </li>
            <li>
              アカウントの削除を希望する場合は、下記の連絡手段からお申し出
              ください。確認のうえ、アカウントと関連データを削除します。
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">6. 共有範囲</h2>
          <p>
            旅行のデータは、その旅行に参加しているメンバーの間で共有されます。
            「プライベート」に設定した項目は作成者本人にのみ表示されます。
            招待リンクを知っている人は旅行に参加できるため、リンクの共有範囲に
            ご注意ください。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">7. お問い合わせ</h2>
          <p>
            本ポリシーに関するお問い合わせ・アカウント削除の依頼は、アプリ内の
            フィードバック機能からご連絡ください。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">8. 改定</h2>
          <p>
            本ポリシーを改定する場合は、このページで告知し、最終更新日を
            更新します。
          </p>
        </section>
      </div>
    </main>
  );
}
