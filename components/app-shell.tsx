"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Wordmark } from "./brand";
import { useData } from "./data-provider";
import { BottomNav, Sidebar } from "./nav";
import { NotificationDrawer } from "./notification-drawer";
import { TransactionSheet } from "./transaction-sheet";
import { UndoToast } from "./undo-toast";

/** Pages render through this gate so the route itself is always part of the static shell. */
export function Ready({ children }: { children: ReactNode }) {
  const { status } = useData();
  return status === "ready" ? children : <LoadingScreen />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { status, error, refresh, refreshing } = useData();
  const router = useRouter();
  const leaving = status === "signed-out" || status === "expired";

  // proxy.ts keeps signed-out visitors away; this covers sessions that end while the app
  // is open (sign out, or the backend rejecting a stale cookie). ?expired=1 stops the proxy
  // bouncing a stale-but-readable cookie straight back here.
  useEffect(() => {
    if (leaving) router.replace(status === "expired" ? "/login?expired=1" : "/login");
  }, [leaving, status, router]);

  if (leaving) return <div className="min-h-dvh bg-canvas" aria-busy="true" />;
  if (status === "error") {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-sm text-center">
          <Wordmark className="justify-center" />
          <span className="mx-auto mt-10 grid size-14 place-items-center rounded-full bg-coral-soft text-coral">
            <CloudOff size={26} />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-ink">Couldn&apos;t load your money</h1>
          <p className="mt-2 text-[15px] text-ink-2">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-canvas disabled:opacity-60"
          >
            <RefreshCw size={18} className={refreshing ? "animate-spin" : undefined} /> Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-dvh lg:pl-64">
      <Sidebar />
      {error ? (
        <div role="status" className="fixed inset-x-4 top-[max(env(safe-area-inset-top),0.75rem)] z-40 mx-auto flex max-w-md items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-4 text-sm text-canvas shadow-float lg:left-64">
          <CloudOff size={16} className="shrink-0 text-canvas/70" />
          <span className="flex-1 truncate">Couldn&apos;t refresh. Showing saved data.</span>
          <button type="button" onClick={() => void refresh()} className="rounded-full bg-canvas/15 px-3 py-1 font-medium hover:bg-canvas/25">
            Retry
          </button>
        </div>
      ) : null}
      <main className="pb-nav">{children}</main>
      <BottomNav />
      <TransactionSheet />
      <NotificationDrawer />
      <UndoToast />
    </div>
  );
}

function LoadingScreen() {
  return (
    <div aria-busy="true" aria-label="Loading your transactions">
      <div className="mx-auto max-w-6xl lg:px-8 lg:pt-8">
        <div className="hero-bg h-72 animate-pulse lg:rounded-[32px]" />
        <div className="relative -mt-8 space-y-4 rounded-t-[32px] bg-canvas px-4 pt-6 lg:mt-6 lg:bg-transparent lg:px-0">
          <div className="h-6 w-32 animate-pulse rounded-full bg-line" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-36 animate-pulse rounded-card bg-surface" />
            <div className="h-36 animate-pulse rounded-card bg-surface" />
          </div>
          <div className="h-14 animate-pulse rounded-full bg-line" />
          <div className="h-20 animate-pulse rounded-card bg-surface" />
          <div className="h-20 animate-pulse rounded-card bg-surface" />
        </div>
      </div>
    </div>
  );
}
