import type { Metadata, Viewport } from "next";
import { Fraunces, Geist_Mono, Inter } from "next/font/google";
import SmoothScroll from "@/components/SmoothScroll";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
  variable: "--font-fraunces",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-face",
});

export const metadata: Metadata = {
  title: "Vango: a loyalty card that lives in your wallet",
  description:
    "Pay a shop in NIM from Nimiq Pay and the stamp lands by itself, verified on the chain.",
};

export const viewport: Viewport = {
  themeColor: "#0b0f1a",
};

// Nimiq Pay injects its provider before page scripts run, so the wallet gets the
// app and everyone else gets the landing page, with no flash of the wrong one.
const payRedirect =
  "if (location.pathname === '/' && (window.nimiqPay || window.nimiq)) location.replace('/app')";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: payRedirect }} />
      </head>
      <body className="bg-ink text-paper antialiased">
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
