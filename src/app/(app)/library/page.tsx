import { Suspense } from "react";
import { LibraryPage } from "@/features/library/library-page";

export const metadata = { title: "Library" };

export default function Page() {
  return (
    <Suspense>
      <LibraryPage />
    </Suspense>
  );
}
