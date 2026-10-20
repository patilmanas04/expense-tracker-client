import type { Metadata } from "next";

import { Ready } from "@/components/app-shell";
import { ReportView } from "@/components/views/report";

export const metadata: Metadata = { title: "Report" };

export default function ReportPage() {
  return (
    <Ready>
      <ReportView />
    </Ready>
  );
}
