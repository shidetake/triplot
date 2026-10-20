import Link from "next/link";

// プライバシーポリシーの英語版（参考訳）。正本は日本語版（privacy-ja.tsx）で、
// ここはその訳。中身を変える時は日本語版を先に直し、こちらを合わせる。
export function PrivacyEn() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/"
        className="text-sm text-muted-foreground transition hover:text-foreground"
      >
        ← triplot
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Last updated: October 20, 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground">
        <section className="space-y-2">
          <p>
            triplot (the &quot;Service&quot;) is a service for planning trips
            and for recording and settling travel expenses. This policy
            describes the information the Service (the web version and the iOS
            app) collects and how it is handled.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">1. Information we collect</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium">Account information</span> — When
              you sign in with a Google or Apple account, we receive your email
              address, name, and profile picture.
            </li>
            <li>
              <span className="font-medium">Information you enter</span> —
              Content you register with the Service, such as trip names,
              dates, events, places, expenses, to-dos, and your display name
              within a trip.
            </li>
            <li>
              <span className="font-medium">Forwarded emails</span> — With the
              receipt import feature, the content of emails you forward to your
              dedicated address (the body and the content behind receipt links
              in the body).
            </li>
            <li>
              <span className="font-medium">Cookies</span> — Used to keep you
              signed in and to save your theme and language settings. We do not
              use cookies for advertising or cross-site tracking.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">2. How we use information</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              To provide the Service&apos;s features, such as trip planning,
              expense recording, and settlement
            </li>
            <li>
              To automatically extract expenses and events from forwarded
              emails (see section 4)
            </li>
            <li>To prevent abuse and to respond to incidents</li>
            <li>To understand usage in order to operate and improve the Service</li>
          </ul>
          <p>
            We do not use collected information for advertising, and we do not
            sell it to third parties.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">3. Google user data</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium">Sign in with Google</span> — We use
              your email address, name, and profile picture for authentication
              and to display your account. We also use your name and email
              address to operate the Service (to understand usage).
            </li>
            <li>
              <span className="font-medium">Export to Google Calendar</span> —
              Only when you explicitly request it, we create a calendar owned
              by the Service and write events to that calendar, and nothing
              else (scope: <code>calendar.app.created</code>). We never read
              the contents of your existing calendars. The access token is
              held only temporarily in your browser and is never sent to or
              stored on the Service&apos;s servers.
            </li>
          </ul>
          <p>
            The Service&apos;s use of information received from Google APIs
            adheres to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">
            4. Third-party services (processors)
          </h2>
          <p>The Service uses the following third-party services.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Supabase — database and authentication (Tokyo region)</li>
            <li>Vercel — hosting (Tokyo region)</li>
            <li>Cloudflare — DNS and relaying of forwarded emails</li>
            <li>Google Maps / Places API — map display and place search</li>
            <li>
              Large language models (LLMs) — Email content is sent only for
              extracting expenses and events from forwarded receipt emails. It
              is never sent for any other purpose and never provided for model
              training.
            </li>
            <li>Resend — sending notification emails from the operator</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">5. Storage and deletion</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Data is stored in Supabase (Tokyo region).</li>
            <li>
              The original text of forwarded emails is automatically deleted
              90 days after receipt.
            </li>
            <li>
              Deleting a trip also deletes the events, places, expenses, and
              other data linked to it.
            </li>
            <li>
              If you wish to delete your account, please contact us through the
              channel below. After confirmation, we will delete your account
              and related data.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">6. Sharing</h2>
          <p>
            Trip data is shared among the members participating in that trip.
            Items set to &quot;Private&quot; are visible only to their creator.
            Anyone who knows an invitation link can join the trip, so please
            be careful about whom you share the link with.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">7. Contact</h2>
          <p>
            For questions about this policy or to request account deletion,
            please contact us through the in-app feedback feature.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">8. Changes</h2>
          <p>
            If we change this policy, we will announce it on this page and
            update the &quot;Last updated&quot; date.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">9. Language</h2>
          <p>
            The Japanese version of this policy is the authoritative version.
            This English version is a translation provided for reference; in
            case of any discrepancy, the Japanese version prevails.
          </p>
        </section>
      </div>
    </main>
  );
}
