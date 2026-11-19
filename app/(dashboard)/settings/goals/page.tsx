import type { Metadata } from "next";

import { Ready } from "@/components/app-shell";
import { GoalsView } from "@/components/views/goals";

export const metadata: Metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <Ready>
      <GoalsView />
    </Ready>
  );
}
