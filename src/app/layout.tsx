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
    // suppressHydrationWarning: browser extensions add attributes to <html> and <body> before
    // React loads; that is not a rendering difference in our code.
    <html lang="en-GB" className={`${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
