"use client";

import { ChartPie, CircleAlert, Info, MessageSquareText, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { GOOGLE_SIGN_IN_URL, getAuthConfig } from "@/lib/api";

import { Wordmark } from "./brand";
import { cx } from "./ui";

const ERRORS: Record<string, string> = {
  configuration: "Google sign-in isn't configured on the server yet. Add the Google keys to the backend .env.",
  account: "That Google account doesn't have access. Sign in with the owner account.",
  signin: "Sign-in didn't finish. Please try again.",
};

/** The /login page. proxy.ts sends signed-out visitors here before any dashboard is rendered. */
export function SignIn() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    getAuthConfig()
      .then((config) => setEnabled(config.google_enabled))
      .catch(() => setEnabled(false));
  }, []);

  return (
    <main className="flex min-h-dvh flex-col lg:flex-row">
      <section className="hero-bg relative flex flex-col px-6 pt-safe pb-20 text-white lg:w-1/2 lg:justify-between lg:p-14">
        <Wordmark light className="mt-4" />
        <div className="mt-14 max-w-md lg:mt-0">
          <h1 className="text-[34px] leading-[1.1] font-bold tracking-tight sm:text-5xl">Every rupee, at a glance.</h1>
          <p className="mt-4 text-[16px] leading-relaxed text-white/85">
            Folio reads your bank SMS and turns them into a clear picture of where your money goes.
          </p>
        </div>
        <ul className="mt-10 hidden gap-3 text-sm text-white/90 lg:grid">
          {[
            [MessageSquareText, "HDFC & ICICI alerts parsed automatically"],
            [ChartPie, "Spending by category, merchant and month"],
            [Sparkles, "Smart categories when rules aren't sure"],
          ].map(([Icon, text]) => {
            const I = Icon as typeof Sparkles;
            return (
              <li key={text as string} className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-white/20">
                  <I size={17} />
                </span>
                {text as string}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="relative -mt-9 flex flex-1 flex-col rounded-t-[32px] bg-canvas px-6 pt-9 pb-10 lg:mt-0 lg:items-center lg:justify-center lg:rounded-none">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h2>
          <p className="mt-2 text-[15px] text-ink-2">This is a private dashboard. Use the Google account set as its owner.</p>

          {/* Reads the URL, so it streams in after the static shell. */}
          <Suspense fallback={null}>
            <SignInNotice googleEnabled={enabled} />
          </Suspense>

          <a
            href={enabled === false ? undefined : GOOGLE_SIGN_IN_URL}
            aria-disabled={enabled === false}
            className={cx(
              "insight-glow mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-insight text-[16px] font-semibold text-on-insight transition active:scale-[0.99]",
              enabled === false && "pointer-events-none opacity-40",
            )}
          >
            <GoogleGlyph />
            Continue with Google
          </a>
          <p className="mt-6 text-center text-xs text-ink-3">Only your name, email and photo are requested.</p>
        </div>
      </section>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}

/**
 * ?error=... comes back from a failed Google sign-in (via the backend and proxy.ts);
 * ?expired=1 means the backend no longer accepted the session.
 */
function SignInNotice({ googleEnabled }: { googleEnabled: boolean | null }) {
  const params = useSearchParams();
  const code = params.get("error");
  if (code || googleEnabled === false) {
    return (
      <p role="alert" className="mt-6 flex gap-2.5 rounded-2xl bg-coral-soft p-4 text-sm text-coral-ink">
        <CircleAlert size={18} className="mt-0.5 shrink-0" />
        {code ? (ERRORS[code] ?? ERRORS.signin) : ERRORS.configuration}
      </p>
    );
  }
  if (params.has("expired")) {
    return (
      <p role="status" className="mt-6 flex gap-2.5 rounded-2xl bg-violet-soft p-4 text-sm text-violet-strong">
        <Info size={18} className="mt-0.5 shrink-0" />
        Your session ended. Please sign in again.
      </p>
    );
  }
  return null;
}
