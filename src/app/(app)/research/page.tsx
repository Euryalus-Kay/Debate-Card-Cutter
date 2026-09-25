import { Suspense } from "react";
import { ResearchPage } from "@/features/research/research-page";

export const metadata = { title: "Research" };

export default function Page() {
  return (
    <Suspense>
      <ResearchPage />
    </Suspense>
  );
}
