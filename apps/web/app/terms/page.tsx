import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "利用規約 | triplot",
};

// 利用規約（公開ページ・認証不要）。Google OAuth の同意画面に載せるリンク先
// （ブランディングの「アプリケーション利用規約リンク」に登録する）と、
// App Store の要件を満たす単一の真実。
//
// 実装の実態（利用枠の月間上限・共有リンクは URL を知っていれば誰でも参加できる
// 等）と齟齬が出たら必ずこちらも更新すること。法的文書なので i18n は当面 ja のみ
// （プライバシーポリシーと同じ扱い）。
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/"
        className="text-sm text-muted-foreground transition hover:text-foreground"
      >
        ← triplot
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">利用規約</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        最終更新日: 2026年9月1日
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
        <section className="space-y-2">
          <p>
            本規約は、triplot（以下「本サービス」）の利用条件を定めるものです。
            本サービスは、旅行の予定・場所・費用・TODO を複数人で共有しながら
            作るためのサービスで、web 版と iOS アプリを提供します。
            本サービスを利用した時点で、本規約に同意したものとみなします。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">1. アカウント</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              本サービスの利用には、Google または Apple アカウントでの
              サインインが必要です。ただし、共有リンクから旅行に参加するだけの
              場合はサインインを必要としません。
            </li>
            <li>
              アカウントの管理は利用者の責任で行うものとし、第三者に利用させない
              でください。
            </li>
            <li>
              アカウントの削除を希望する場合は、アプリ内のフィードバック機能から
              お申し出ください。
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">2. 利用料金と利用枠</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>本サービスは現在、無償で提供しています。</li>
            <li>
              メール取り込み機能には、1 か月あたりの処理件数の上限があります。
              上限に達した場合、その月はメールからの自動取り込みが行われません
              （メール自体は保存され、失われることはありません）。
            </li>
            <li>
              将来、有償プランを導入する場合があります。その際は、事前に本サービス
              上で告知します。
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">3. 利用者が登録する内容</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              旅行の内容、転送したメール、アップロードした画像など、利用者が
              登録した内容についての責任は利用者が負います。
            </li>
            <li>
              権利者の許諾なく第三者の著作物・個人情報を登録しないでください。
            </li>
            <li>
              利用者が登録した内容の権利は利用者に帰属します。本サービスは、
              サービスの提供に必要な範囲でのみこれを保存・処理します
              （取り扱いの詳細は
              <Link
                href="/privacy"
                className="text-blue-600 transition hover:underline"
              >
                プライバシーポリシー
              </Link>
              をご確認ください）。
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">4. 共有リンク</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              旅行の共有リンクを知っている人は、サインインせずにその旅行に参加し、
              内容を閲覧・編集できます。
              <span className="font-medium">
                リンクを渡す相手は利用者が選んでください。
              </span>
            </li>
            <li>
              リンクが意図しない相手に渡った場合は、アプリの「再生成」でリンクを
              作り直してください。以前のリンクは無効になります。
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">5. 禁止事項</h2>
          <p>本サービスの利用にあたり、次の行為を禁止します。</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>法令または公序良俗に反する行為</li>
            <li>
              他の利用者、第三者、または本サービスの権利・利益を侵害する行為
            </li>
            <li>
              本サービスの運営を妨げる行為（過度な負荷をかける行為、不正アクセス、
              自動化された大量のリクエストなど）
            </li>
            <li>
              本サービスを通じて取得した情報を、権限なく第三者に開示する行為
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">
            6. サービスの変更・中断・終了
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              本サービスの内容は、事前の告知なく変更・追加・削除する場合があります。
            </li>
            <li>
              保守、障害、外部サービスの停止などにより、本サービスの提供を一時的に
              中断する場合があります。
            </li>
            <li>
              本サービスの提供を終了する場合は、データを取り出せる期間を設けたうえで
              事前に告知します。
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">7. 免責</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              メールからの自動取り込みは、内容の解析結果に誤りが含まれる場合が
              あります。金額・日時・場所などは、確定する前に利用者が確認して
              ください。
            </li>
            <li>
              費用の記録および精算の計算結果は目安であり、実際の支払いや債権債務
              関係を確定するものではありません。
            </li>
            <li>
              本サービスは現状有姿で提供され、特定の目的への適合性を保証しません。
              本サービスの利用により生じた損害について、当方の故意または重過失に
              よる場合を除き、責任を負いません。
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">8. 準拠法・裁判管轄</h2>
          <p>
            本規約は日本法に準拠します。本サービスに関して紛争が生じた場合は、
            東京地方裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">9. お問い合わせ</h2>
          <p>
            本規約に関するお問い合わせは、アプリ内のフィードバック機能から
            ご連絡ください。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">10. 改定</h2>
          <p>
            本規約は必要に応じて改定します。重要な変更がある場合は、本サービス上で
            告知します。改定後に本サービスを利用した場合、改定後の規約に同意した
            ものとみなします。
          </p>
        </section>
      </div>
    </main>
  );
}
