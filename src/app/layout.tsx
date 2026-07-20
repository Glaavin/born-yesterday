import type { Metadata } from "next";
import { Bitter, Barlow } from "next/font/google";
import "./globals.css";
import Shell from "@/components/Shell";

const bitter = Bitter({
  variable: "--font-bitter",
  subsets: ["latin"],
  weight: ["700", "900"],
  style: ["normal", "italic"],
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const title = "Born Yesterday — Trust Reports for SaaS";
const description =
  "Checking the receipts before you check out. Trust Reports built from public data: domain age, marketing history, and ownership signals.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    url: "https://bornyesterday.tech",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bitter.variable} ${barlow.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
