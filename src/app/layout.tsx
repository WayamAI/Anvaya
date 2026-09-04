import type { Metadata } from "next";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anvaya — Production Planning",
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
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
