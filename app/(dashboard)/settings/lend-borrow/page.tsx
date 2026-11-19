import type { Metadata } from "next";

import { Ready } from "@/components/app-shell";
import { LedgerView } from "@/components/views/ledger";

export const metadata: Metadata = { title: "Lend & borrow" };

export default function LendBorrowPage() {
  return (
    <Ready>
      <LedgerView />
    </Ready>
  );
}
