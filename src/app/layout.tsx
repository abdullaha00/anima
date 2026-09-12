import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell/Shell";

// Plus Jakarta Sans is the single typeface of the Cairn design system; hierarchy comes
// from weight and size. Geist was the starter's default and is replaced deliberately.
// Self-hosted by next/font at build time, so nothing is fetched at runtime.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cairn",
  description:
    "Advance care planning, coordinated. Indicators present in the record, a prompt for clinical review.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
