import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { THEME_BOOTSTRAP, ThemeProvider } from "@/components/theme";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Folio", template: "%s · Folio" },
  description: "Your bank SMS, turned into a clear picture of where your money goes.",
  applicationName: "Folio",
  appleWebApp: { capable: true, title: "Folio", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The ThemeProvider overwrites these when the in-app choice differs from the OS setting.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by the bootstrap script, not React, so hydration must not "fix" it.
    <html lang="en-IN" className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
