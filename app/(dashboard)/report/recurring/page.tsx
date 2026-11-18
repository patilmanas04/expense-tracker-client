import type { Metadata } from "next";

import { Ready } from "@/components/app-shell";
import { RecurringView } from "@/components/views/recurring";

export const metadata: Metadata = { title: "Recurring" };

export default function RecurringPage() {
  return (
    <Ready>
      <RecurringView />
    </Ready>
  );
}
