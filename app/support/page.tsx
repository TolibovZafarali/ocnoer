import type { Metadata } from "next";
import Link from "next/link";

const supportEmail = "support@ocnoer.com";

export const metadata: Metadata = {
  title: "Support | Ocnoer: In Another Life",
  description: "Support information for Ocnoer: In Another Life."
};

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900 sm:py-16">
      <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-10">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">
          Ocnoer: In Another Life
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Support
        </h1>
        <p className="mt-5 text-base leading-7 text-slate-700">
          Need help with Ocnoer: In Another Life? Send a message and include a
          short description of what happened, including whether the issue affects
          login, story loading, or saved progress.
        </p>

        <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Contact</h2>
          <p className="mt-2 text-base text-slate-700">
            Email:{" "}
            <a
              href={`mailto:${supportEmail}`}
              className="font-medium text-slate-950 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-700"
            >
              {supportEmail}
            </a>
          </p>
        </div>

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-slate-950">
            Basic troubleshooting
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-base leading-7 text-slate-700">
            <li>Update the app to the latest available version.</li>
            <li>Check that your internet connection is working.</li>
            <li>Restart the app and try again.</li>
            <li>
              Contact support if progress, login, or story loading still fails.
            </li>
          </ul>
        </section>

        <p className="mt-8 text-sm text-slate-500">
          You can also read the{" "}
          <Link
            href="/privacy"
            className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-700"
          >
            privacy policy
          </Link>
          .
        </p>
      </article>
    </main>
  );
}
