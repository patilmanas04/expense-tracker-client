"use client";

import { ChartColumnBig, House, ReceiptText, Search, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Wordmark } from "./brand";
import { useData } from "./data-provider";
import { Avatar, cx } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/report", label: "Report", icon: ChartColumnBig },
  { href: "/activity", label: "Activity", icon: ReceiptText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function useSearchAction() {
  const router = useRouter();
  const { requestActivity } = useData();
  return () => {
    requestActivity({ focusSearch: true });
    router.push("/activity");
  };
}

/** Phone tab bar with the raised violet action from the reference. */
export function BottomNav() {
  const pathname = usePathname();
  const search = useSearchAction();
  const [first, second, third, fourth] = NAV;
  const item = (nav: NavItem) => {
    const active = pathname === nav.href;
    const Icon = nav.icon;
    return (
      <Link
        key={nav.href}
        href={nav.href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex flex-col items-center gap-1 rounded-2xl py-1 text-[12px] transition focus-visible:outline-2 focus-visible:outline-violet",
          active ? "font-semibold text-ink" : "font-medium text-ink-2 hover:text-ink",
        )}
      >
        <Icon size={24} strokeWidth={active ? 2.5 : 2} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0} />
        {nav.label}
      </Link>
    );
  };
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-[28px] bg-surface/95 px-3 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[0_-10px_30px_-18px_rgb(16_16_20/0.35)] backdrop-blur-lg lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-center">
        {item(first)}
        {item(second)}
        {/* In normal flow (not absolutely offset) so it always sits fully inside the bar. */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={search}
            aria-label="Search transactions"
            className="fab-bg grid size-14 place-items-center rounded-full text-white shadow-fab transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet"
          >
            <Search size={24} strokeWidth={2.4} />
          </button>
        </div>
        {item(third)}
        {item(fourth)}
      </div>
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const search = useSearchAction();
  const { user } = useData();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line/70 bg-surface/60 px-5 py-7 backdrop-blur lg:flex">
      <Link href="/" className="px-2" aria-label="Folio home">
        <Wordmark />
      </Link>
      <button
        type="button"
        onClick={search}
        className="mt-8 flex h-11 items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-sm text-ink-3 shadow-card transition hover:text-ink-2"
      >
        <Search size={17} /> Search transactions
      </button>
      <nav aria-label="Main" className="mt-6 space-y-1">
        {NAV.map((nav) => {
          const active = pathname === nav.href;
          const Icon = nav.icon;
          return (
            <Link
              key={nav.href}
              href={nav.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] transition",
                active ? "bg-surface font-semibold text-ink shadow-card" : "font-medium text-ink-2 hover:bg-surface/70 hover:text-ink",
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} className={active ? "text-violet" : undefined} />
              {nav.label}
            </Link>
          );
        })}
      </nav>
      {user ? (
        <Link href="/settings" className="mt-auto flex items-center gap-3 rounded-2xl p-2 transition hover:bg-surface">
          <Avatar name={user.name || user.email} picture={user.picture} className="size-10 ring-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{user.name || "Owner"}</span>
            <span className="block truncate text-xs text-ink-2">{user.email}</span>
          </span>
        </Link>
      ) : null}
    </aside>
  );
}
