import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaBootstrap } from "@/components/PwaBootstrap";
import { Shell } from "@/components/Shell";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "LIMM Works Command Centre",
  description: "Boss operations command centre for LIMM Works.",
  manifest: "/manifest.webmanifest",
  applicationName: "LIMM Works",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LIMM Works"
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ]
  }
};

export const viewport: Viewport = {
  themeColor: "#05070A"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const vercelObservabilityEnabled = process.env.VERCEL === "1";

  return (
    <html lang="en">
      <body>
        <PwaBootstrap />
        <Shell>{children}</Shell>
        {vercelObservabilityEnabled ? <Analytics /> : null}
        {vercelObservabilityEnabled ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
