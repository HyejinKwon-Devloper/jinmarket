import type { Metadata, Viewport } from "next";

import { AppShell } from "../components/AppShell";

import "./globals.css";

const shopAppUrl =
  process.env.NEXT_PUBLIC_SHOP_APP_URL ?? "https://web.jinmarket.shop";

export const metadata: Metadata = {
  metadataBase: new URL(shopAppUrl),
  applicationName: "Jinmarket Buyer",
  manifest: "/manifest.webmanifest",
  title: "JINMARKET 구매자 사이트",
  description: "굿즈 거래를 더 빠르게 둘러볼 수 있는 JINMARKET 구매자 웹앱입니다.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Jinmarket Buyer",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon-192.png"],
  },
  openGraph: {
    type: "website",
    url: shopAppUrl,
    title: "JINMARKET 구매자 사이트",
    description: "굿즈 거래를 더 빠르게 둘러볼 수 있는 JINMARKET 구매자 웹앱입니다.",
    siteName: "JINMARKET",
    images: [
      {
        url: "/header.png",
        alt: "JINMARKET 대표 이미지",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JINMARKET 구매자 사이트",
    description: "굿즈 거래를 더 빠르게 둘러볼 수 있는 JINMARKET 구매자 웹앱입니다.",
    images: ["/header.png"],
  },
  other: {
    "facebook-domain-verification": "ffk2jbyjn6phl8vetpkp87bjuf7q4o",
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1f4e79",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
