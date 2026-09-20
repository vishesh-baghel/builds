import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", weight: ["500", "600", "700"] });
const body = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  title: "reckon: reads what the customer writes back",
  description:
    "Chasing an unpaid invoice is two jobs. Sending the reminder is a commodity. Reading the reply still lands on a person. This reads the reply.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {children}
        {/* Vercel's own analytics: cookieless, no cross-site identifier, page-level counts
            only. Enabled on the project already; without these two it was collecting
            nothing, which is the failure mode worth naming, since a dashboard that is on but
            empty reads as "nobody visited" rather than "not wired up". */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
