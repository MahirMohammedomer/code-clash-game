import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Code Clash — Competitive 4-Digit Code Breaker",
  description:
    "Crack the 4-digit secret code before your rival! Play Online 1v1, vs 4-Tier AI, Hotseat, Local Offline, and Tournaments.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Code Clash",
  },
};

export const viewport: Viewport = {
  themeColor: "#182d43",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#FFFDF7] text-[#2B2D42] font-sans antialiased selection:bg-[#58CC02]/20">
        {children}
      </body>
    </html>
  );
}
