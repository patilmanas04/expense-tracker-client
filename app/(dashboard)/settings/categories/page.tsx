import type { Metadata } from "next";

import { Ready } from "@/components/app-shell";
import { CategoriesView } from "@/components/views/categories";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <Ready>
      <CategoriesView />
    </Ready>
  );
}
