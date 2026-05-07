import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Ocnoer: In Another Life",
  description: "Privacy policy for Ocnoer: In Another Life."
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900 sm:py-16">
      <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-10">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">
          Ocnoer: In Another Life
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: May 7, 2026</p>

        <div className="mt-8 space-y-7 text-base leading-7 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Overview</h2>
            <p className="mt-3">
              Ocnoer: In Another Life is an interactive story and visual novel.
              This policy explains the information the app may use so players can
              access the story and continue from where they left off.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-950">
              Information the app may use
            </h2>
            <p className="mt-3">
              The app may use login and session information to let a player sign
              in, restore access, and open the story. The app may also save story
              progress, story choices, a cat name if the player enters one, and
              basic activity or progress sync information needed to keep the
              experience consistent across supported surfaces.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-950">
              How information is used
            </h2>
            <p className="mt-3">
              This information is used to provide the story experience, remember
              progress, sync activity, maintain player access, and troubleshoot
              support requests. We do not use this information for third-party
              advertising.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-950">
              Advertising, selling, and tracking
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>We do not sell personal data.</li>
              <li>We do not use third-party advertising in the app.</li>
              <li>We do not track users across other apps or websites.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-950">Contact</h2>
            <p className="mt-3">
              For privacy questions or support requests, please use the{" "}
              <Link
                href="/support"
                className="font-medium text-slate-950 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-700"
              >
                support page
              </Link>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
