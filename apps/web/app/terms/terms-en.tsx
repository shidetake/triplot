import Link from "next/link";

// 利用規約の英語版（参考訳）。正本は日本語版（terms-ja.tsx）で、ここはその訳。
// 中身を変える時は日本語版を先に直し、こちらを合わせる。
export function TermsEn() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/"
        className="text-sm text-muted-foreground transition hover:text-foreground"
      >
        ← triplot
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">Terms of Service</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Last updated: October 20, 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
        <section className="space-y-2">
          <p>
            These terms set out the conditions for using triplot (the
            &quot;Service&quot;). The Service lets several people build a
            trip&apos;s schedule, places, expenses, and to-dos together, and is
            offered as a web version and an iOS app. By using the Service, you
            are deemed to have agreed to these terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">1. Accounts</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Using the Service requires signing in with a Google or Apple
              account. However, joining a trip through a share link does not
              require signing in.
            </li>
            <li>
              You are responsible for managing your account. Do not let third
              parties use it.
            </li>
            <li>
              If you wish to delete your account, please let us know through
              the in-app feedback feature.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">2. Fees and usage limits</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>The Service is currently provided free of charge.</li>
            <li>
              The email import feature has a monthly limit on the number of
              emails processed. Once the limit is reached, emails are not
              imported automatically for the rest of that month (the emails
              themselves are kept and are not lost).
            </li>
            <li>
              We may introduce paid plans in the future. If we do, we will
              announce it on the Service in advance.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">3. Content you register</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              You are responsible for the content you register, such as trip
              details, forwarded emails, and uploaded images.
            </li>
            <li>
              Do not register works or personal information of third parties
              without the rights holder&apos;s permission.
            </li>
            <li>
              The rights to the content you register remain with you. The
              Service stores and processes it only to the extent necessary to
              provide the Service (see the{" "}
              <Link
                href="/privacy"
                className="text-blue-600 transition hover:underline"
              >
                Privacy Policy
              </Link>{" "}
              for details on how it is handled).
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">4. Share links</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Anyone who knows a trip&apos;s share link can join that trip
              without signing in, and can view and edit its content.{" "}
              <span className="font-medium">
                You choose whom to give the link to.
              </span>
            </li>
            <li>
              If a link reaches someone you did not intend, use
              &quot;Regenerate&quot; in the app to create a new link. The
              previous link will stop working.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">5. Prohibited conduct</h2>
          <p>When using the Service, the following are prohibited.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Conduct that violates laws or public order and morals</li>
            <li>
              Conduct that infringes the rights or interests of other users,
              third parties, or the Service
            </li>
            <li>
              Conduct that interferes with the operation of the Service
              (placing excessive load, unauthorized access, large volumes of
              automated requests, and the like)
            </li>
            <li>
              Disclosing information obtained through the Service to third
              parties without authorization
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">
            6. Changes, interruption, and termination of the Service
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              We may change, add to, or remove parts of the Service without
              prior notice.
            </li>
            <li>
              We may temporarily interrupt the Service for maintenance, outages,
              suspension of third-party services, and similar reasons.
            </li>
            <li>
              If we end the Service, we will announce it in advance and provide
              a period during which you can export your data.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">7. Disclaimers</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Automatic import from emails may contain errors in how the
              content is interpreted. Please check amounts, dates, places, and
              other details before confirming them.
            </li>
            <li>
              Recorded expenses and calculated settlements are estimates and do
              not determine actual payments or debts between people.
            </li>
            <li>
              The Service is provided as is, with no guarantee of fitness for a
              particular purpose. Except in cases of our willful misconduct or
              gross negligence, we are not liable for damages arising from use
              of the Service.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">
            8. Governing law and jurisdiction
          </h2>
          <p>
            These terms are governed by the laws of Japan. Any dispute
            relating to the Service shall be subject to the exclusive
            jurisdiction of the Tokyo District Court as the court of first
            instance.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">9. Contact</h2>
          <p>
            For questions about these terms, please contact us through the
            in-app feedback feature.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">10. Changes to these terms</h2>
          <p>
            We revise these terms as needed. If there are significant changes,
            we will announce them on the Service. If you use the Service after
            a revision, you are deemed to have agreed to the revised terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">11. Language</h2>
          <p>
            The Japanese version of these terms is the authoritative version.
            This English version is a translation provided for reference; in
            case of any discrepancy, the Japanese version prevails.
          </p>
        </section>
      </div>
    </main>
  );
}
