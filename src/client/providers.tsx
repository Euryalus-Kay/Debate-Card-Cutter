"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { requestPersistentStorage } from "@/client/sync/idb";
import { Toaster, TooltipProvider } from "@/components/ui";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: (n, e) => n < 2 && !String(e).includes("40") },
        },
      }),
  );
  useEffect(() => {
    // Offline support: cache the app for bad tournament Wi-Fi (production builds only; the dev
    // server's hot reload and a service worker don't mix), and ask the browser to keep our data.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    void requestPersistentStorage();
  }, []);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
