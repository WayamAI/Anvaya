import type { Metadata } from "next";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  // The browser tab shows this next to the favicon, where the space is tight
  // and the product name is what identifies the tab. The longer descriptive
  // form is kept for link previews below.
  title: "Anvaya",
  description: "Anvaya — Material Planning & ERP Platform",
  authors: [{ name: "Anvaya" }],
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    title: "Anvaya — Production Planning",
    description: "Anvaya — Material Planning & ERP Platform",
    images: ["/favicon.svg"],
  },
  twitter: {
    card: "summary_large_image",
    site: "@Anvaya",
    title: "Anvaya — Production Planning",
    description: "Anvaya — Material Planning & ERP Platform",
    images: ["/favicon.svg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Michroma is the wordmark face only, so it is loaded as a stylesheet
          link rather than through next/font: it is used on two surfaces, and a
          build-time fetch is not worth making the build network-dependent.
          Geist ships locally from /public/fonts.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Michroma&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
