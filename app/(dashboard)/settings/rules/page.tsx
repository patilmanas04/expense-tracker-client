import type { Metadata } from "next";

import { Ready } from "@/components/app-shell";
import { RulesView } from "@/components/views/rules";

export const metadata: Metadata = { title: "Names and rules" };

export default function RulesPage() {
  return (
    <Ready>
      <RulesView />
    </Ready>
  );
}
