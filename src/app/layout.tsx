import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "CardCutter",
  description: "AI-powered evidence card cutting for high school policy debate",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased bg-[#050505]">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
