import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CardCutter - HS Policy Debate Card Generator",
  description: "AI-powered evidence card cutting for high school policy debate",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
