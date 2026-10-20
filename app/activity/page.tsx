import type { Metadata } from "next";

import { Ready } from "@/components/app-shell";
import { ActivityView } from "@/components/views/activity";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <Ready>
      <ActivityView />
    </Ready>
  );
}
