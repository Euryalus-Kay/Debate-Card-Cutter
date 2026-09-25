"use client";

import { FlaskConical } from "lucide-react";
import { EmptyState } from "@/components/ui";

export function ResearchPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight">Research</h1>
        <p className="text-[13px] text-muted">Find real sources, fetch their full text, and cut verified cards.</p>
        <EmptyState icon={<FlaskConical className="size-8" />} title="Research pipeline loading">
          This page is being connected to the source-verified card cutter.
        </EmptyState>
      </div>
    </div>
  );
}
