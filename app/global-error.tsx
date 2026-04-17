"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

type GlobalErrorPageProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function GlobalErrorPage({
  error,
  reset
}: GlobalErrorPageProps) {
  useEffect(() => {
    console.error("Global app error", {
      message: error.message,
      digest: error.digest,
      error
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        className="min-h-screen bg-slate-950 text-slate-50"
        style={{
          background:
            "radial-gradient(circle at 20% 0%, #12192d 0%, #05070f 55%, #03050c 100%)"
        }}
      >
        <main className="flex min-h-screen items-center justify-center px-6 py-8">
          <section className="w-full max-w-md rounded-3xl border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Ocnoer
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
                Application Error
              </h1>
              <p className="text-sm text-slate-300">
                The app hit a server rendering error.
              </p>
              <p className="text-sm text-slate-400">
                If this persists, check the deployment logs and match them
                against the digest below.
              </p>
            </div>

            {error.digest ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Error Digest
                </p>
                <p className="mt-1 break-all font-mono text-sm text-slate-100">
                  {error.digest}
                </p>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end">
              <Button type="button" onClick={reset}>
                Retry
              </Button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
