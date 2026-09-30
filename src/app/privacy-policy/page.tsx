import Link from "next/link";
import GlobalHeader from "@/components/global-header";
import React from "react";
import GlobalFooter from "@/components/global-footer";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
  title: "Privacy Policy - Just Noted",
  description:
    "What JustNoted collects, why, where it's stored, and what you can do about it — in plain English.",
};

const H2 =
  "mt-8 pb-2 border-b border-[var(--color-border-primary)] font-semibold text-base";
const H3 = "mt-4 font-semibold text-[15px]";
const A =
  "text-[var(--color-accent)] font-medium hover:px-1 hover:bg-[var(--color-accent)] hover:text-white transition-all duration-200";

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[13.5px] border-collapse">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="text-left font-semibold align-top py-2 px-2 border-b border-[var(--color-border-primary)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td
                  key={j}
                  className="align-top py-2 px-2 border-b border-[var(--color-border-secondary)]"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PrivacyPolicyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const mail = (
    <a href="mailto:privacy@justnoted.app" className={A}>
      privacy@justnoted.app
    </a>
  );

  return (
    <>
      <GlobalHeader user={user} />

      <main className="flex-grow w-full pt-14">
        <div className="max-w-3xl mx-auto px-6 py-10 font-light leading-[1.65] text-[15px]">
          <h1 className="text-2xl font-semibold">
            Privacy Policy for{" "}
            <span className="p-1 bg-[var(--color-accent)]">
              Just<span className="text-white">Noted</span>
            </span>
          </h1>
          <p className="mt-3 text-[var(--color-text-secondary)]">
            <span className="font-medium">Last updated:</span> September 30, 2026
          </p>

          {/* Who we are */}
          <h2 className={H2}>Who we are</h2>
          <p className="mt-3">
            JustNoted (justnoted.app) is run by RAVENCI Solutions (ABN 35 664 615
            205), based in Queensland, Australia. This policy explains what we
            collect, why we collect it, where it is stored, and what you can do
            about it.
          </p>
          <p className="mt-3">
            We have written it in plain English and tried to be upfront,
            including about the limits of what we offer. If anything is unclear,
            email us at {mail}.
          </p>

          {/* What we collect */}
          <h2 className={H2}>What we collect</h2>
          <p className="mt-3">We collect only what we need to run JustNoted:</p>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <span className="font-medium">Account details:</span> your email
              address, your name if you add one, and sign-in records. Your
              password is stored scrambled (hashed) by our sign-in system, so we
              never see it.
            </li>
            <li>
              <span className="font-medium">Your notes:</span> note content,
              titles, notebooks, version history, trash, sharing settings and the
              people you share with.
            </li>
            <li>
              <span className="font-medium">Local notes:</span> if you write
              without an account (or move a note to Local), we store the note
              content and a random anonymous ID that lives in your browser.
            </li>
            <li>
              <span className="font-medium">Subscription details:</span> if you
              subscribe to Scribe, Stripe handles the payment. We receive your
              plan, subscription status and billing email, never your full card
              number.
            </li>
            <li>
              <span className="font-medium">Usage and technical data:</span> pages
              visited, device and browser type, approximate location based on your
              IP address, and error and performance information (see{" "}
              <em>Cookies and analytics</em>).
            </li>
            <li>
              <span className="font-medium">Messages you send us,</span> such as
              support emails.
            </li>
          </ul>
          <p className="mt-3">
            We don&apos;t ask for sensitive information. Anything you choose to
            write in a note is treated as note content and protected as described
            below.
          </p>

          {/* How we use it */}
          <h2 className={H2}>How we use it</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <span className="font-medium">To run JustNoted:</span> saving,
              syncing and sharing your notes, signing you in, and recovering local
              notes when you use a recovery key.
            </li>
            <li>
              <span className="font-medium">To email you about your account:</span>{" "}
              sign-up confirmation, password resets, &ldquo;your export is
              ready&rdquo; messages, and any notifications you turn on (such as
              when someone shares a note with you), as often as you choose. We
              don&apos;t send marketing emails unless you opt in.
            </li>
            <li>
              <span className="font-medium">To process Scribe payments,</span>{" "}
              through Stripe.
            </li>
            <li>
              <span className="font-medium">
                To fix problems and improve JustNoted,
              </span>{" "}
              using analytics and error tracking.
            </li>
            <li>
              <span className="font-medium">To keep JustNoted secure,</span>{" "}
              including preventing abuse and rate-limiting suspicious activity.
            </li>
            <li>
              <span className="font-medium">To meet legal obligations,</span> such
              as keeping billing records for tax purposes.
            </li>
          </ul>
          <p className="mt-3">
            We don&apos;t sell your information, we don&apos;t show ads, and we
            don&apos;t use your notes to train AI. JustNoted has no AI features
            today; if we add any, we&apos;ll update this policy and tell you before
            they touch your notes.
          </p>

          {/* Encryption and access */}
          <h2 className={H2}>Your notes, encryption and access</h2>
          <p className="mt-3">
            Your notes are encrypted in transit (HTTPS) and at rest on our
            servers. They are <span className="font-medium">not</span> end-to-end
            encrypted. That means the people who run JustNoted could technically
            access stored notes, and we want you to know that plainly.
          </p>
          <p className="mt-3">
            We don&apos;t read your notes. Access to note content is limited to
            administrators, and only happens:
          </p>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              when you ask us to, for example to help with a support request or
              recover a note;
            </li>
            <li>
              when we are legally required to (and where we&apos;re allowed,
              we&apos;ll tell you).
            </li>
          </ul>
          <p className="mt-3">
            <span className="font-medium">Shared notes:</span> anyone you share a
            note with can see it, and edit it if you allow editing. Collaborators
            may see your name or email as the note&apos;s owner.
          </p>

          {/* Local notes and recovery keys */}
          <h2 className={H2}>Local notes and recovery keys</h2>
          <p className="mt-3">
            Local notes are notes created without an account, or moved to Local.
            They are deliberately{" "}
            <span className="font-medium">not linked to any account.</span>
          </p>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              They are stored in your browser and on our servers (Upstash,
              Sydney), identified by a random anonymous ID kept in your browser.
              They are stored on our servers so they are still there when you come
              back.
            </li>
            <li>
              Deleting your account does not delete your local notes. You can
              delete them individually, or clear them from this device in
              Settings.
            </li>
            <li>
              Local notes are deleted after{" "}
              <span className="font-medium">12 months without any activity.</span>
            </li>
          </ul>
          <p className="mt-3">
            <span className="font-medium">Recovery keys</span> let you reach your
            local notes from another browser or after clearing your browser data.
            We store only a scrambled (hashed) version of your key, so we
            can&apos;t show it to you again or recover it for you. Anyone who has
            your key can open your local notes, so keep it private. You can create
            a new key at any time, which stops the old one working.
          </p>

          {/* Where data is stored */}
          <h2 className={H2}>Where your data is stored</h2>
          <p className="mt-3">
            Your notes and account are stored on servers in Canada and Australia.
            We use a small number of trusted services to run JustNoted, and some
            of them are based overseas, so your information may be sent outside
            Australia.
          </p>
          <div className="mt-4">
            <Table
              head={["Service", "What it's used for", "Where data is stored"]}
              rows={[
                [
                  "Our servers (OVHcloud, running Supabase)",
                  "Accounts, cloud notes, version history",
                  "Canada and Australia (Sydney)",
                ],
                ["Upstash", "Local notes, security rate limits", "Australia (Sydney)"],
                ["Stripe", "Scribe payments", "United States and other countries"],
                ["Resend", "Account and export emails", "United States"],
                [
                  "Google Analytics",
                  "Usage analytics",
                  "United States and other countries",
                ],
                ["OpenPanel", "Usage analytics", "[confirm]"],
                ["LogRocket", "Uptime monitoring", "United States"],
              ]}
            />
          </div>
          <p className="mt-3">
            Each of these services only receives what it needs to do its job.
          </p>

          {/* Cookies and analytics */}
          <h2 className={H2}>Cookies and analytics</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <span className="font-medium">Essential:</span> sign-in cookies and
              browser storage for your local notes, anonymous ID and preferences.
              JustNoted can&apos;t work without these.
            </li>
            <li>
              <span className="font-medium">Analytics:</span> Google Analytics and
              OpenPanel help us understand how JustNoted is used. They only run if
              you agree in the cookie banner, and you can change your choice at any
              time in [where].
            </li>
            <li>
              <span className="font-medium">Uptime monitoring:</span> LogRocket
              checks that JustNoted is online and alerts us if it isn&apos;t. It
              doesn&apos;t track you or record your activity.
            </li>
          </ul>

          {/* Retention */}
          <h2 className={H2}>How long we keep data</h2>
          <p className="mt-3">We keep your information only as long as it&apos;s needed.</p>
          <div className="mt-4">
            <Table
              head={["Data", "How long"]}
              rows={[
                ["Account and cloud notes", "Until you delete them or your account"],
                [
                  "Trash",
                  "30 days (free) or 60 or 90 days (Scribe, your choice), then permanently deleted",
                ],
                [
                  "Version history",
                  "Up to 50 automatic versions per note, plus some safety copies; deleted with the note",
                ],
                ["Local notes", "12 months after their last activity"],
                ["Account exports", "7 days, then deleted"],
                ["Backups", "About 30 days, then overwritten"],
                ["Billing records", "As long as tax law requires (usually 5 years in Australia)"],
                ["Analytics data", "[confirm retention settings]"],
              ]}
            />
          </div>
          <p className="mt-3">
            Because of backups, deleted data can remain in a backup copy for up to
            about 30 days before it&apos;s gone for good.
          </p>

          {/* Your rights */}
          <h2 className={H2}>Your rights</h2>
          <p className="mt-3">You&apos;re in control of your information:</p>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <span className="font-medium">Export:</span> Settings lets you export
              your whole account (notes, history and account details) as JSON or
              Markdown. We email you a link when it&apos;s ready; it works for 7
              days and requires you to be signed in. The &ldquo;Export all&rdquo;
              button in the sidebar exports your notes on the spot.
            </li>
            <li>
              <span className="font-medium">Correct:</span> update your details in
              Settings, or ask us.
            </li>
            <li>
              <span className="font-medium">Delete:</span> delete your account in
              Settings. This permanently removes your profile, cloud notes, trash,
              version history, notebooks and shares, and cancels any Scribe
              subscription. Local notes aren&apos;t part of your account and are
              deleted separately.
            </li>
            <li>
              <span className="font-medium">Withdraw consent</span> for analytics
              at any time.
            </li>
            <li>
              <span className="font-medium">Ask us</span> for a copy of your
              information or to correct or delete it. We&apos;ll respond within 30
              days.
            </li>
          </ul>
          <p className="mt-3">
            If you&apos;re in the EU or UK, you also have rights under the GDPR,
            including to object to or restrict processing and to complain to your
            local data protection authority.
          </p>

          {/* Children */}
          <h2 className={H2}>Children</h2>
          <p className="mt-3">
            You must be at least 13 to use JustNoted. If you&apos;re under 18,
            please get a parent or guardian&apos;s permission first. If we learn we
            hold information from a child under 13, we&apos;ll delete it.
          </p>

          {/* Security */}
          <h2 className={H2}>Security</h2>
          <p className="mt-3">
            We use HTTPS, encryption at rest, scrambled (hashed) passwords and
            recovery keys, regular backups and limited administrator access. No
            system is perfectly secure. If a data breach is likely to cause you
            serious harm, we&apos;ll tell you and, where required, the Office of the
            Australian Information Commissioner (OAIC).
          </p>

          {/* Changes */}
          <h2 className={H2}>Changes to this policy</h2>
          <p className="mt-3">
            When we update this policy, we&apos;ll change the date at the top. For
            significant changes, we&apos;ll also let you know by email or in the
            app.
          </p>

          {/* Contact */}
          <h2 className={H2}>Contact and complaints</h2>
          <p className="mt-3">
            Email {mail} with any questions or concerns. If you&apos;re not happy
            with our response, you can contact the OAIC at{" "}
            <a href="https://www.oaic.gov.au" className={A} target="_blank" rel="noreferrer">
              oaic.gov.au
            </a>
            .
          </p>
          <p className="mt-3 text-[var(--color-text-tertiary)]">
            You can also reach us through our{" "}
            <Link href="/contact" className={A}>
              contact page
            </Link>
            .
          </p>
        </div>
      </main>

      <GlobalFooter />
    </>
  );
}
