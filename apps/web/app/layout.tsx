import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CivicVoice", template: "%s · CivicVoice" },
  description: "Report failures in public services in Lagos and Abuja, and see which agencies respond.",
  applicationName: "CivicVoice",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f6b47",
};

// Fonts: system stack for now. Self-host Public Sans with next/font/local
// rather than Google Fonts, so visitors' IPs aren't sent to a third party.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-ground text-ink antialiased">{children}</body>
    </html>
  );
}
