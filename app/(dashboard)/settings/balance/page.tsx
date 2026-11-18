import type { Metadata } from "next";

import { Ready } from "@/components/app-shell";
import { BalanceBreakdownView } from "@/components/views/balance-breakdown";

export const metadata: Metadata = { title: "Bank balance" };

export default function BalancePage() {
  return (
    <Ready>
      <BalanceBreakdownView />
    </Ready>
  );
}
