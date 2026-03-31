import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://patrickbeasley.com"
  ),
  title: {
    default: "Patrick Beasley | Full-Stack Engineer",
    template: "%s | Patrick Beasley",
  },
  description:
    "Full-stack engineer focused on building clean, performant web applications. Explore my projects, resume, and get in touch.",
  keywords: [
    "full-stack engineer",
    "next.js",
    "typescript",
    "react",
    "supabase",
    "web development",
    "software engineer",
  ],
  authors: [{ name: "Patrick Beasley" }],
  creator: "Patrick Beasley",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://patrickbeasley.com",
    siteName: "Patrick Beasley",
    title: "Patrick Beasley | Full-Stack Engineer",
    description:
      "Full-stack engineer focused on building clean, performant web applications. Explore my projects, resume, and get in touch.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Patrick Beasley - Full-Stack Engineer",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Patrick Beasley | Full-Stack Engineer",
    description:
      "Full-stack engineer focused on building clean, performant web applications.",
    images: ["/og-image.png"],
    creator: "@patrickbeasley",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
