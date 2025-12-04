import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from "@vercel/analytics/next"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "dinkpad | Ultimate Pickleball Session Organizer & Open Play Manager",
  description:
    "Automate and optimize your pickleball open play sessions with dinkpad. The premier app for fair court rotation, player management, and stress-free hosting. The perfect companion to ReClub for professional pickleball organizers.",
  applicationName: "dinkpad",
  keywords: [
    "pickleball",
    "session organizer",
    "open play",
    "court rotation",
    "pickleball app",
    "fair play",
    "tournament manager",
    "pickleball host",
    "ReClub",
    "pickleball automation",
    "sports management",
  ],
  authors: [{ name: "dinkpad Team" }],
  openGraph: {
    title: "dinkpad | Ultimate Pickleball Session Organizer",
    description:
      "Automate and optimize your pickleball open play sessions with dinkpad. Ensure fair play and reduce host workload.",
    type: "website",
    siteName: "dinkpad",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "dinkpad | Pickleball Session Manager",
    description:
      "The ultimate tool for pickleball hosts. Automate court rotation and ensure fair play.",
  },
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
