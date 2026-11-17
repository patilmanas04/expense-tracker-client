import type { Metadata } from "next";

import { Ready } from "@/components/app-shell";
import { LimitsView } from "@/components/views/limits";

export const metadata: Metadata = { title: "Spending limits" };

export default function LimitsPage() {
  return (
    <Ready>
      <LimitsView />
    </Ready>
  );
}
