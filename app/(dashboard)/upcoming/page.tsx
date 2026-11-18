import type { Metadata } from "next";

import { Ready } from "@/components/app-shell";
import { UpcomingView } from "@/components/views/upcoming";

export const metadata: Metadata = { title: "Upcoming" };

export default function UpcomingPage() {
  return (
    <Ready>
      <UpcomingView />
    </Ready>
  );
}
