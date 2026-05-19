import Image from "next/image";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/ocnoer-in-another-life/id6766773856";

export default function HomePage() {
  return (
    <main className="landing flex min-h-screen items-center justify-center overflow-hidden px-6 text-slate-100">
      <div aria-hidden className="landing-aurora landing-aurora-one" />
      <div aria-hidden className="landing-aurora landing-aurora-two" />
      <div aria-hidden className="landing-aurora landing-aurora-three" />
      <div aria-hidden className="landing-grain" />
      <div aria-hidden className="landing-vignette" />

      <section className="relative z-10 flex flex-col items-center text-center">
        <div className="landing-icon-wrap">
          <div aria-hidden className="landing-icon-glow" />
          <Image
            src="/icon.png"
            alt="Ocnoer app icon"
            width={144}
            height={144}
            priority
            className="landing-icon"
          />
        </div>

        <h1 className="mt-10 font-dialogue text-5xl font-light tracking-[0.28em] text-white sm:text-6xl">
          OCNOER
        </h1>

        <p className="mt-3 font-character-name text-4xl text-white/75 sm:text-5xl">
          in another life
        </p>

        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="landing-cta group mt-12 inline-flex items-center gap-3 rounded-2xl bg-white px-7 py-4 text-slate-950 shadow-[0_24px_70px_-30px_rgba(255,255,255,0.85)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_90px_-32px_rgba(255,255,255,0.95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <svg
            aria-hidden
            viewBox="0 0 384 512"
            className="h-7 w-7"
            fill="currentColor"
          >
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM256.3 89.5c30.1-35.7 27.3-68.2 26.4-79.5-26.6 1.5-57.4 18.1-74.9 38.5-19.3 21.9-30.6 49-28.2 78.8 28.7 2.2 54.8-12.5 76.7-37.8z" />
          </svg>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-slate-500">
              Download on the
            </span>
            <span className="text-lg font-semibold tracking-tight">
              App Store
            </span>
          </span>
        </a>
      </section>
    </main>
  );
}
