import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "Cairn",
  description: "Typed facts that outlive the session.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}>
      <body className="min-h-screen font-sans text-ink antialiased">
        <header className="border-b border-rule/80 bg-paper-raised/80 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-6 px-4 sm:px-6">
            <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
              Cairn
            </Link>
            <nav className="flex items-center gap-5 text-sm font-medium text-ink-muted">
              <Link href="/" className="transition-colors hover:text-ink">
                Desk
              </Link>
              <Link href="/canvas" className="transition-colors hover:text-ink">
                Canvas
              </Link>
            </nav>
          </div>
        </header>
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</div>
      </body>
    </html>
  );
}
