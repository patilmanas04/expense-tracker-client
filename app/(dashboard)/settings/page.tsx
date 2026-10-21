import type { Metadata } from "next";

import { Ready } from "@/components/app-shell";
import { SettingsView } from "@/components/views/settings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Ready>
      <SettingsView />
    </Ready>
  );
}
