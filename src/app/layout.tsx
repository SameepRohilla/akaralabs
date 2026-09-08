import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { GOOGLE_FONTS, SITE, THEME_BOOTSTRAP } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s — ${SITE.name}`,
  },
  description:
    "A prototyping and product-engineering studio in India. CAD, 3D printing, and small-batch production for hardware founders, robotics, drones, IoT, defence and industrial clients — plus premium custom gifting.",
  icons: {
    icon: [{ url: "/assets/img/favicon.svg", type: "image/svg+xml" }],
    apple: "/assets/img/favicon.svg",
  },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_IN",
    url: SITE.url,
    images: [{ url: "/assets/img/og-image.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/assets/img/og-image.png"] },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0C0B09",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-logo="wordmark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href={GOOGLE_FONTS} rel="stylesheet" />
        {/* The design system is served verbatim from /public rather than
            imported, so the original static CSS stays byte-identical.
            eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/assets/css/akara.css" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
        <Script src="/assets/js/image-slot.js" strategy="afterInteractive" />
        <Script src="/assets/js/art.js" strategy="afterInteractive" />
        <Script src="/assets/js/i18n.js" strategy="afterInteractive" />
        <Script src="/assets/js/shared.js" strategy="afterInteractive" />
        <Script src="/assets/js/analytics.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
