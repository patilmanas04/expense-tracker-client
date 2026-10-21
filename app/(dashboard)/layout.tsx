import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { DataProvider } from "@/components/data-provider";

/** Signed-in area. proxy.ts sends signed-out visitors to /login before this renders. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DataProvider>
      <AppShell>{children}</AppShell>
    </DataProvider>
  );
}
