import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import HashScrollHandler from "@/components/hash-scroll-handler";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
    "Full-stack engineer focused on building clean, performant web applications.",
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
      "Full-stack engineer focused on building clean, performant web applications.",
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

// Runs before hydration so there is no theme flash. Dark is the default:
// any missing/unrecognized localStorage value resolves to "dark".
const THEME_INIT_SCRIPT = `(function(){try{var t=window.localStorage.getItem('theme');document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-text">
        <HashScrollHandler />
        {children}
      </body>
    </html>
  );
}
